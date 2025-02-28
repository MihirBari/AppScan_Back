const ErrorHandler = require("../utils/errorhandler");


exports.isAuthenticatedUser = catchAsyncErrors(async (req, res, next) => {
    const { token } = req.cookies;
  
    if (!token) {
      return next(new ErrorHandler("Please Login to access this resource", 401));
    }
  
    const decodedData = jwt.verify(token, process.env.JWT_SECRET);
  
    req.user = await User.findById(decodedData.id);
  
    next();
  });

exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    console.log(req.user);
    if (!req.user || !req.user.role) {
      // If req.user or req.user.role is undefined, the user is not authenticated
      const errorMessage = "User is not authenticated";
      const statusCode = 401; // Unauthorized status code
      return next(new ErrorHandler(errorMessage, statusCode));
    }

    const { role } = req.user;

    if (!roles.includes(role)) {
      const errorMessage = `Role: ${role} is not allowed to access this resource`;
      const statusCode = 403; // Forbidden status code
      return next(new ErrorHandler(errorMessage, statusCode));
    }

    next(); // If user is authenticated and has the required role, proceed to the next middleware
  };
};