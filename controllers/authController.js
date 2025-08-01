// controllers/authController.js
const db = require('../db');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

// Helper function to hash password
const hashPassword = async (password) => {
    return await bcrypt.hash(password, SALT_ROUNDS);
};

// Helper function to compare password
const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

exports.loginForm = (req, res) => {
  res.render('login', { 
    error: null,
    success: req.query.message || null,
    user: req.session.user || null,
    formData: req.body || {} // Add formData with form values or empty object as fallback
  });
};

exports.registerForm = (req, res) => {
  res.render('register', { 
    error: null, 
    success: null,
    user: req.session.user || null,
    formData: req.body || {} // Add formData with form values or empty object as fallback
  });
};

exports.login = async (req, res) => {
    const { UserName, Password } = req.body;

    console.log('Login attempt:', { UserName, password: '***' });

    // Find user by username with role information and questionnaire response
    const userQuery = `
        SELECT u.UserID, u.UserName, u.Email, u.Password, u.RoleID, u.Image,
               u.QuestionnaireID, r.RoleName as role, ut.TokenBalance
        FROM user u
        LEFT JOIN role r ON u.RoleID = r.RoleID
        LEFT JOIN usertokens ut ON u.UserID = ut.UserID
        WHERE u.UserName = ?
    `;

    db.query(userQuery, [UserName], async (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.render('login', {
                error: 'Login failed. Please try again.',
                success: null,
                user: req.session.user || null,
                formData: req.body
            });
        }

        const user = results[0];
        if (!user) {
            return res.render('login', {
                error: 'Invalid username or password',
                success: null,
                user: req.session.user || null,
                formData: req.body
            });
        }

        // Check if password is hashed with bcrypt
        if (user.Password.startsWith('$2')) {
            // Password is already hashed with bcrypt
            const match = await comparePassword(Password, user.Password);
            if (!match) {
                return res.render('login', {
                    error: 'Invalid username or password',
                    success: null,
                    user: req.session.user || null,
                    formData: req.body
                });
            }
        } else {
            // Password is using old SHA2 hashing, verify and update to bcrypt
            const checkPasswordQuery = 'SELECT * FROM user WHERE UserID = ? AND Password = SHA2(?, 256)';
            db.query(checkPasswordQuery, [user.UserID, Password], async (err, passwordResult) => {
                if (err || passwordResult.length === 0) {
                    return res.render('login', {
                        error: 'Invalid username or password',
                        success: null,
                        user: req.session.user || null,
                        formData: req.body
                    });
                }

                // Update password to use bcrypt
                const hashedPassword = await hashPassword(Password);
                const updatePasswordQuery = 'UPDATE user SET Password = ? WHERE UserID = ?';
                db.query(updatePasswordQuery, [hashedPassword, user.UserID]);
            });
        }

        // Set up session
        req.session.user = {
            id: user.UserID,
            username: user.UserName,
            email: user.Email,
            role: user.role || 'user',
            RoleID: user.RoleID,
            tokens: user.TokenBalance || 0,
            profilePicUrl: (() => {
                if (!user.Image || user.Image === 'default-avatar.svg') {
                    return '/images/default-avatar.svg';
                }
                // Handle both full paths and filenames
                if (user.Image.startsWith('/images/')) {
                    return user.Image;
                }
                return '/images/users/' + user.Image;
            })(),
            questionnaireCompleted: user.QuestionnaireID ? true : false
        };

        // Redirect based on role and questionnaire completion
        if (user.RoleID === 1) {
            return res.redirect('/admin');
        } else if (!user.QuestionnaireID) {
            return res.redirect('/questionnaire');
        } else {
            return res.redirect('/user/dashboard');
        }
    });
};

exports.register = (req, res) => {
  const { UserName, Email, Password, confirmPassword, Contact, Address, Role } = req.body;
  const image = req.file;

  // Validate required fields
  if (!UserName || !Email || !Password || !confirmPassword || !Contact || !Address) {
    return res.render('register', { 
      error: 'All fields are required', 
      success: null,
      user: req.session.user || null,
      formData: req.body
    });
  }

  // Check if passwords match
  if (Password !== confirmPassword) {
    return res.render('register', { 
      error: 'Passwords do not match', 
      success: null,
      user: req.session.user || null,
      formData: req.body
    });
  }

  // Check if username exists
  db.query('SELECT * FROM user WHERE UserName = ?', [UserName], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.render('register', { 
          error: 'An error occurred during registration', 
          success: null,
          user: req.session.user || null,
          formData: req.body
        });
      }
      
      if (results.length > 0) {
        return res.render('register', { 
          error: 'Username already exists', 
          success: null,
          user: req.session.user || null,
          formData: req.body
        });
      }
      
      // Validate role ID (1 for admin, 2 for user)
      const roleId = parseInt(Role) || 2; // default to user (2) if no role specified
      if (roleId !== 1 && roleId !== 2) {
        return res.render('register', { 
          error: 'Invalid role selected', 
          success: null,
          user: req.session.user || null,
          formData: req.body
        });
      }

      // Create new user with all fields and hash the password using SHA2
      const createUserQuery = `
        INSERT INTO user (UserName, Email, Password, CreationDate, Contact, Address, RoleID) 
        VALUES (?, ?, SHA2(?, 256), NOW(), ?, ?, ?)
      `;
      
      db.query(createUserQuery, [UserName, Email, Password, Contact, Address, roleId], (err, result) => {
        if (err) {
          console.error('Database error:', err);
          return res.render('register', { 
            error: 'Failed to create account. Please try again.', 
            success: null,
            user: req.session.user || null,
            formData: req.body
          });
        }
        
        const userId = result.insertId;
        
        // Initialize user tokens
        const initTokensQuery = 'INSERT INTO usertokens (UserID, TokenBalance, LastUpdated) VALUES (?, 0, NOW())';
        db.query(initTokensQuery, [userId], (err) => {
          if (err) {
            console.error('Token initialization error:', err);
          }
          
          // If there's an image, update the user's profile
          if (image) {
            // Store just the filename for consistency
            db.query('UPDATE user SET Image = ? WHERE UserID = ?', [image.filename, userId], (err) => {
              if (err) {
                console.error('Profile image update error:', err);
              }
              // Redirect to login page with success message
              res.redirect('/login?message=Registration successful! Please login to continue.');
            });
          } else {
            // Set default avatar for new users
            db.query('UPDATE user SET Image = ? WHERE UserID = ?', ['default-avatar.svg', userId], (err) => {
              if (err) {
                console.error('Default image update error:', err);
              }
              // Redirect to login page with success message
              res.redirect('/login?message=Registration successful! Please login to continue.');
            });
          }
        });
      });
    });
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
};

exports.Profile = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    const userQuery = `
      SELECT u.UserID, u.UserName, u.Email, u.Contact, u.Address, u.Image,
             ut.TokenBalance, r.RoleName as role
      FROM user u
      LEFT JOIN usertokens ut ON u.UserID = ut.UserID
      LEFT JOIN role r ON u.RoleID = r.RoleID
      WHERE u.UserID = ?
    `;
    
    db.query(userQuery, [req.session.user.id], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).render('error', { 
          message: 'Error loading profile',
          user: req.session.user || null
        });
      }
      
      const user = results[0];
      if (!user) {
        return res.status(404).render('error', { 
          message: 'User not found',
          user: req.session.user || null
        });
      }
      
      res.render('profile', { 
        user: {
          ...user,
          id: user.UserID,
          username: user.UserName,
          email: user.Email,
          tokens: user.TokenBalance || 0,
          profilePicUrl: (() => {
            if (!user.Image || user.Image === 'default-avatar.svg') {
              return '/images/default-avatar.svg';
            }
            // Handle both full paths and filenames
            if (user.Image.startsWith('/images/')) {
              return user.Image;
            }
            return '/images/users/' + user.Image;
          })(),
          role: user.role,
          Contact: user.Contact,
          Address: user.Address,
          preferences: req.session.user.preferences || {}
        },
        error: req.query.error || null,
        success: req.query.success || null
      });
      
      // Also update the session with the latest profile image
      if (user.Image) {
        // Apply the same path logic for session update
        if (user.Image === 'default-avatar.svg') {
          req.session.user.profilePicUrl = '/images/default-avatar.svg';
        } else if (user.Image.startsWith('/images/')) {
          req.session.user.profilePicUrl = user.Image;
        } else {
          req.session.user.profilePicUrl = '/images/users/' + user.Image;
        }
      } else {
        req.session.user.profilePicUrl = '/images/default-avatar.svg';
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).render('error', { 
      message: 'Error loading profile',
      user: req.session.user || null
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    const userId = req.session.user.id;
    const { username, email, contact, address } = req.body;
    
    // Handle profile picture upload if provided
    let imageFilename = null;
    if (req.file) {
      imageFilename = req.file.filename; // Store just the filename for consistency
      console.log('Profile image uploaded:', {
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path
      });
    } else {
      console.log('No file uploaded in request');
    }
    
    // Update user information in database
    let updateQuery, updateParams;
    
    if (imageFilename) {
      updateQuery = 'UPDATE user SET UserName = ?, Email = ?, Contact = ?, Address = ?, Image = ? WHERE UserID = ?';
      updateParams = [username, email, contact, address, imageFilename, userId];
    } else {
      updateQuery = 'UPDATE user SET UserName = ?, Email = ?, Contact = ?, Address = ? WHERE UserID = ?';
      updateParams = [username, email, contact, address, userId];
    }
    
    db.query(updateQuery, updateParams, (err) => {
      if (err) {
        console.error('Update profile error:', err);
        return res.redirect('/profile?error=1');
      }
      
      console.log('Profile updated successfully. New imageFilename:', imageFilename);
      
      // Update session with new information
      req.session.user.username = username;
      req.session.user.email = email;
      if (imageFilename) {
        // Update session with properly constructed image path
        req.session.user.profilePicUrl = '/images/users/' + imageFilename;
        console.log('Updated session profilePicUrl:', req.session.user.profilePicUrl);
      }
      
      res.redirect('/profile?success=1');
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.redirect('/profile?error=1');
  }
};

exports.changePassword = async (req, res) => {
    const userId = req.session.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate password match
    if (newPassword !== confirmPassword) {
        return res.render('profile', {
            user: req.session.user,
            error: 'New passwords do not match',
            success: null
        });
    }

    // Get current user's password
    const getUserQuery = 'SELECT Password FROM user WHERE UserID = ?';
    db.query(getUserQuery, [userId], async (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.render('profile', {
                user: req.session.user,
                error: 'Failed to change password',
                success: null
            });
        }

        const user = results[0];
        let passwordValid = false;

        // Check if password is hashed with bcrypt
        if (user.Password.startsWith('$2')) {
            passwordValid = await comparePassword(currentPassword, user.Password);
        } else {
            // Check old SHA2 password
            const checkOldPasswordQuery = 'SELECT * FROM user WHERE UserID = ? AND Password = SHA2(?, 256)';
            const [oldPasswordCheck] = await new Promise((resolve) => {
                db.query(checkOldPasswordQuery, [userId, currentPassword], (err, results) => {
                    resolve(results || []);
                });
            });
            passwordValid = !!oldPasswordCheck;
        }

        if (!passwordValid) {
            return res.render('profile', {
                user: req.session.user,
                error: 'Current password is incorrect',
                success: null
            });
        }

        // Hash and update new password
        try {
            const hashedPassword = await hashPassword(newPassword);
            const updatePasswordQuery = 'UPDATE user SET Password = ? WHERE UserID = ?';
            
            db.query(updatePasswordQuery, [hashedPassword, userId], (err) => {
                if (err) {
                    console.error('Password update error:', err);
                    return res.render('profile', {
                        user: req.session.user,
                        error: 'Failed to update password',
                        success: null
                    });
                }

                res.render('profile', {
                    user: req.session.user,
                    error: null,
                    success: 'Password updated successfully'
                });
            });
        } catch (err) {
            console.error('Password hashing error:', err);
            return res.render('profile', {
                user: req.session.user,
                error: 'Failed to update password',
                success: null
            });
        }
    });
};

exports.updatePreferences = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    const userId = req.session.user.id;
    const { emailNotifications, courseReminders, achievementAlerts } = req.body;
    
    // Convert checkbox values to boolean
    const emailNotif = emailNotifications === 'on';
    const courseRemind = courseReminders === 'on';
    const achieveAlerts = achievementAlerts === 'on';
    
    // For now, we'll store preferences in the session
    // In a real application, you'd want a preferences table
    req.session.user.preferences = {
      emailNotifications: emailNotif,
      courseReminders: courseRemind,
      achievementAlerts: achieveAlerts
    };
    
    res.redirect('/profile?success=Preferences updated successfully');
  } catch (error) {
    console.error('Update preferences error:', error);
    res.redirect('/profile?error=Failed to update preferences');
  }
};
