import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.model.js";
import env from "./env.js";

// Google Strategy
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
          let user = await User.findOne({ email: profile.emails[0]?.value });

          if (!user) {
            user = await User.create({
              name: profile.displayName,
              email: profile.emails[0]?.value,
              provider: "google",
              googleId: profile.id,
              isEmailVerified: true,
            });
          } else if (!user.googleId) {
            user.googleId = profile.id;
            user.provider = "google";
            user.isEmailVerified = true;
            await user.save();
          }

          return done(null, user);
        } catch (error) {
          console.error("Google Strategy Error:", error);
          return done(error, null);
        }
      }
    )
  );
  console.log('✅ Google OAuth configured');
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