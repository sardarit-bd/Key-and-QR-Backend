import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.model.js";
import env from "./env.js";

if (env.googleClientId && env.googleClientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: `${env.apiUrl}/api/v1/auth/google/callback`,
        scope: ["profile", "email"],
        proxy: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0]?.value;

          if (!email) {
            return done(new Error("No email found in Google profile"), null);
          }

          // First try to find by googleId (fastest)
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            // Try by email
            user = await User.findOne({ email });

            if (user) {
              // Link existing account with Google
              user.googleId = profile.id;
              user.provider = "google";
              user.isEmailVerified = true;
              await user.save();
            } else {
              // Create new user
              user = await User.create({
                name: profile.displayName,
                email,
                provider: "google",
                googleId: profile.id,
                isEmailVerified: true,
              });
            }
          }

          return done(null, user);
        } catch (error) {
          console.error("Google Strategy Error:", error);
          return done(error, null);
        }
      }
    )
  );

  console.log("✅ Google OAuth configured");
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;