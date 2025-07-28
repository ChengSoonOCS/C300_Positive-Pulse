const db = require('../db');

exports.feedbackForm = (req, res) => {
    res.render('feedback', { 
        messages: req.flash('success'), 
        errors: req.flash('error') 
    });
};

exports.submitFeedback = (req, res) => {
    const userId = req.session.user.userId;
    const { category, message } = req.body;
    let attachmentUrl = null;

    if (req.file) {
        attachmentUrl = req.file.filename;
    }

    const sql = 'INSERT INTO user_feedback (userId, category, message, submittedAt, status, attachmentUrl) VALUES (?, ?, ?, NOW(), ?, ?)';
    db.query(sql, [userId, category, message, 'pending', attachmentUrl], (err, result) => {
        if (err) {
            console.error('Database query error:', err.message);
            req.flash('error', 'Failed to submit feedback. Please try again.');
            return res.redirect('/feedback');
        }
        
        console.log(result);
        req.flash('success', 'Feedback submitted successfully!');
        res.redirect('/feedback');
    });
};

exports.getFeedback = (req, res) => {
    const feedbackId = req.params.id;
    const sql = 'SELECT f.*, u.userName FROM user_feedback f JOIN user u ON f.userId = u.userId WHERE f.feedbackId = ?';
    
    db.query(sql, [feedbackId], (error, results) => {
        if (error) {
            console.error('Database query error:', error);
            req.flash('error', 'Error retrieving feedback');
            return res.redirect('/admin/dashboard');
        }

        if (results.length > 0) {
            res.render('viewFeedback', { 
                feedback: results[0],
                messages: req.flash('success'),
                errors: req.flash('error'),
                session: req.session
            });
        } else {
            req.flash('error', 'Feedback not found');
            res.redirect('/admin/dashboard');
        }
    });
};

exports.updateFeedbackStatus = (req, res) => {
    const feedbackId = req.params.id;
    const { status } = req.body;

    const sql = 'UPDATE user_feedback SET status = ? WHERE feedbackId = ?';
    
    db.query(sql, [status, feedbackId], (error, result) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error updating feedback status');
        }

        req.flash('success', 'Feedback status updated successfully');
        res.redirect('/admin/dashboard');
    });
};

exports.deleteFeedback = (req, res) => {
    const feedbackId = req.params.id;
    const sql = 'DELETE FROM user_feedback WHERE feedbackId = ?';
    
    db.query(sql, [feedbackId], (error, results) => {
        if (error) {
            console.error('Error deleting feedback:', error);
            return res.status(500).send('Error deleting feedback');
        }
        
        res.redirect('/admin/dashboard');
    });
};