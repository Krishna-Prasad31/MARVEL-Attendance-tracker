
const User = require("../models/user");

// Verify that the request has a valid, active user session.
async function requireAuth(req, res, next) {
  try {
    const sessionUser = req.session?.user;

    if (!sessionUser?.id) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    // Check the database so deactivated accounts cannot keep
    // using an old session.
    const user = await User.findById(sessionUser.id).select(
      "_id username name role isActive"
    );

    if (!user || !user.isActive) {
      req.session.destroy(() => {});

      return res.status(401).json({
        message: "Your session is no longer valid. Please log in again.",
      });
    }

    // Always use the latest role from the database.
    req.user = {
      id: user._id.toString(),
      username: user.username,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error.message);

    return res.status(500).json({
      message: "Unable to verify authentication.",
    });
  }
}

// Restrict access to specified roles.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action.",
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
