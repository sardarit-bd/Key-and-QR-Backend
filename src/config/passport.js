import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.model.js";
import env from "./env.js";

// Only configure Google Strategy if credentials exist
if (env.googleClientId && env.googleClientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: `${env.apiUrl}/api/v1/auth/google/callback`,
        scope: ["profile", "email"],
        proxy: true,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          if (!profile) {
            return done(new Error("No profile returned from Google"), null);
          }
          return done(null, profile);
        } catch (error) {
          console.error("Google Strategy Error:", error);
          return done(error, null);
        }
      }
    )
  );

  console.log("✅ Google OAuth configured");
} else {
  console.warn("⚠️ Google OAuth credentials missing");
}

// Serialize and Deserialize
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

// Initialize passport
export const initializePassport = () => {
  return passport.initialize();
};

export default passport;