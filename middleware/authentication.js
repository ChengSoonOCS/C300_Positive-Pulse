// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user has completed questionnaire
const checkQuestionnaire = (req, res, next) => {
    if (!req.session.user) {
        req.flash('error', 'Please log in to view this resource');
        return res.redirect('/login');
    }

    // Skip questionnaire check for admins
    if (req.session.user.RoleID === 1) {
        return next();
    }

    // Check if user has completed questionnaire
    const userQuery = 'SELECT QuestionnaireID FROM user WHERE UserID = ?';
    require('../db').query(userQuery, [req.session.user.id], (err, results) => {
        if (err) {
            console.error('Questionnaire check error:', err);
            req.flash('error', 'Server error');
            return res.redirect('/questionnaire');
        }

        if (!results[0]?.QuestionnaireID) {
            console.log('User has not completed questionnaire');
            req.flash('error', 'Please complete the questionnaire first');
            return res.redirect('/questionnaire');
        }

        next();
    });
};

// Middleware to check if user is admin, RoleID should be 1
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.RoleID == 1) { 
        console.log("User has admin rights")
        return next();
    } else {
        console.log("User DO NOT have admin rights")
        req.flash('error', 'Access denied');
        res.redirect('/401');
    }
};

// Middleware to check if user is logged in and a user (also allow admins)
const checkUser= (req, res, next) => {
    if (req.session.user && (req.session.user.RoleID == 2 || req.session.user.RoleID == 1)) {
        console.log("User is logged in with appropriate access")
        return next();
    } else {
        console.log("This function is for users only.")
        req.flash('error', 'This function is for users only.');
        res.redirect('/401');
    }
};

module.exports = {
    checkAuthenticated,
    checkAdmin,
    checkUser,
    checkQuestionnaire
};