// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { UserName, Password, confirmPassword } = req.body;

    // Check for required fields
    if (!UserName || !Password || !confirmPassword) {
        return res.render('register', { 
            error: 'All fields are required', 
            success: null,
            formData: req.body
        });
    }

    // Check username length
    if (UserName.length < 3 || UserName.length > 20) {
        return res.render('register', { 
            error: 'Username must be between 3 and 20 characters', 
            success: null,
            formData: req.body
        });
    }

    // Check password length
    if (Password.length < 6) {
        return res.render('register', { 
            error: 'Password should be at least 6 characters long', 
            success: null,
            formData: req.body
        });
    }

    // Check password confirmation
    if (Password !== confirmPassword) {
        return res.render('register', { 
            error: 'Passwords do not match', 
            success: null,
            formData: req.body
        });
    }

    next();
};


const validateLogin = (req, res, next) => {
    const { UserName, Password } = req.body;

    if (!UserName || !Password) {
        return res.render('login', { 
            error: 'All fields are required',
            success: null,
            user: req.session.user || null,
            formData: req.body
        });
    }

    // Basic validation for username length
    if (UserName.length < 3) {
        return res.render('login', { 
            error: 'Invalid username format',
            success: null,
            user: req.session.user || null,
            formData: req.body
        });
    }

    // Basic validation for password length
    if (Password.length < 6) {
        return res.render('login', { 
            error: 'Invalid password format',
            success: null,
            user: req.session.user || null,
            formData: req.body
        });
    }

    next();
};

module.exports = {
    validateRegistration,
    validateLogin
};