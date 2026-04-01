import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
// import { Strategy as AppleStrategy } from "passport-apple"; // Disabled for now
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
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ email: profile.emails[0]?.value });

          if (!user) {
            // Create new user
            user = await User.create({
              name: profile.displayName,
              email: profile.emails[0]?.value,
              provider: "google",
              googleId: profile.id,
              isEmailVerified: true,
            });
          } else if (!user.googleId) {
            // Link existing account with Google
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
} else {
  console.log('⚠️ Google OAuth not configured - missing credentials');
}

// Apple Strategy - DISABLED for now
// if (env.appleClientId && env.appleTeamId && env.appleKeyId && env.applePrivateKey) {
//   passport.use(
//     new AppleStrategy(
//       {
//         clientID: env.appleClientId,
//         teamID: env.appleTeamId,
//         keyID: env.appleKeyId,
//         privateKeyString: env.applePrivateKey,
//         callbackURL: `${env.apiUrl}/api/auth/apple/callback`,
//         scope: ["name", "email"],
//       },
//       async (accessToken, refreshToken, idToken, profile, done) => {
//         try {
//           let user = await User.findOne({ email: profile.email });
//
//           if (!user) {
//             user = await User.create({
//               name: profile.name?.firstName + " " + profile.name?.lastName || "Apple User",
//               email: profile.email,
//               provider: "apple",
//               appleId: profile.id,
//               isEmailVerified: true,
//             });
//           }
//
//           return done(null, user);
//         } catch (error) {
//           console.error("Apple Strategy Error:", error);
//           return done(error, null);
//         }
//       }
//     )
//   );
//   console.log('✅ Apple OAuth configured');
// } else {
//   console.log('⚠️ Apple OAuth not configured - missing credentials');
// }

console.log('⏸️ Apple OAuth is disabled (commented)');

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