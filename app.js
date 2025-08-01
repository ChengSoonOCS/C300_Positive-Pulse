const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('express-flash');
const path = require('path');

const app = express();

// Configure body-parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Import middleware
const { checkAuthenticated, checkAdmin, checkUser, checkQuestionnaire } = require('./middleware/authentication');
const { validateRegistration, validateLogin } = require('./middleware/validation');

// Import database connection
const db = require('./db');

// Import controllers
//Caitlyns Controller
const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const modulesController = require('./controllers/modulesController');
const userController = require('./controllers/userController');
//Adelson's Feedback and AI Controller
const feedbackController = require('./controllers/feedbackController');
const AIController = require('./controllers/AIController');


// Define port
const port = process.env.PORT || 3000;

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/images/users');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware setup
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Flash messages middleware
app.use(flash());

// ====================
// PUBLIC ROUTES (No authentication required)
// ====================

// Home page
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user || null });
});

// Education modules (guest accessible)
app.get('/education', modulesController.showModules);
app.get('/education/modules', modulesController.showModules);
app.get('/education/modules/:id', modulesController.showModule);
app.get('/education/modules/:id/chapters/:chapterId', modulesController.showModule);

// Other public pages
app.get('/compare', async (req, res) => {
  try {
    let user = req.session.user || null;
    
    // If user is logged in, get their current token balance
    if (user) {
      const userTokenQuery = `
        SELECT u.UserID, u.UserName, u.Email, u.RoleID, ut.TokenBalance, uImage
        FROM user u
        LEFT JOIN usertokens ut ON u.UserID = ut.UserID
        WHERE u.UserID = ?
      `;
      
      const userResult = await new Promise((resolve, reject) => {
        db.query(userTokenQuery, [user.id], (err, results) => {
          if (err) reject(err);
          else resolve(results[0] || null);
        });
      });
      
      if (userResult) {
        user = {
          ...user,
          tokens: userResult.TokenBalance || 0,
          profilePicUrl: userResult.Image || '/images/default-avatar.svg'
        };
      }
    }
    
    res.render('compare', { user });
  } catch (error) {
    console.error('Compare page error:', error);
    res.render('compare', { user: req.session.user || null });
  }
});

// app.get('/game', async (req, res) => {
//   try {
//     let user = req.session.user || null;
    
//     // If user is logged in, get their current token balance
//     if (user) {
//       const userTokenQuery = `
//         SELECT u.UserID, u.UserName, u.Email, u.RoleID, ut.TokenBalance, u.Image
//         FROM user u
//         LEFT JOIN usertokens ut ON u.UserID = ut.UserID
//         WHERE u.UserID = ?
//       `;
      
//       const userResult = await new Promise((resolve, reject) => {
//         db.query(userTokenQuery, [user.id], (err, results) => {
//           if (err) reject(err);
//           else resolve(results[0] || null);
//         });
//       });
      
//       if (userResult) {
//         user = {
//           ...user,
//           tokens: userResult.TokenBalance || 0,
//           profilePicUrl: userResult.Image || '/images/default-avatar.svg'
//         };
//       }
//     }
    
//     res.render('game', { user });
//   } catch (error) {
//     console.error('Game page error:', error);
//     res.render('game', { user: req.session.user || null });
//   }
// });

// Universal rewards page (accessible to all, different functionality based on auth)
app.get('/rewards', async (req, res) => {
  try {
    // Get all active rewards
    const rewardsQuery = 'SELECT RewardID, RewardName, Description, TokenCost, QuantityAvailable, IsActive FROM rewards WHERE IsActive = 1 ORDER BY TokenCost ASC';
    
    const rewards = await new Promise((resolve, reject) => {
      db.query(rewardsQuery, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    let userTokens = 0;
    let userRewards = [];
    let userWithTokens = req.session.user || null;
    
    // If user is logged in, get their token balance and redeemed rewards
    if (req.session.user) {
      // Get user's complete data including token balance
      const userTokenQuery = `
        SELECT u.UserID, u.UserName, u.Email, u.RoleID, ut.TokenBalance, u.Image
        FROM user u
        LEFT JOIN usertokens ut ON u.UserID = ut.UserID
        WHERE u.UserID = ?
      `;
      
      const userResults = await new Promise((resolve, reject) => {
        db.query(userTokenQuery, [req.session.user.id], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
      
      if (userResults[0]) {
        userTokens = userResults[0].TokenBalance || 0;
        userWithTokens = {
          ...req.session.user,
          tokens: userTokens,
          profilePicUrl: userResults[0].Image || '/images/default-avatar.svg'
        };
      }
      
      // Get user's redeemed rewards
      const userRewardsQuery = 'SELECT RewardID, RedeemedAt FROM userrewards WHERE UserID = ?';
      userRewards = await new Promise((resolve, reject) => {
        db.query(userRewardsQuery, [req.session.user.id], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
    }
    
    // Add user-specific data to rewards
    const rewardsWithUserData = rewards.map(reward => ({
      ...reward,
      canRedeem: req.session.user && userTokens >= reward.TokenCost,
      alreadyRedeemed: userRewards.some(ur => ur.RewardID === reward.RewardID)
    }));
    
    res.render('rewards', { 
      rewards: rewardsWithUserData,
      user: userWithTokens,
      userTokens: userTokens,
      isAdmin: req.session.user && req.session.user.RoleID === 1
    });
  } catch (error) {
    console.error('Rewards page error:', error);
    res.render('error', { 
      message: 'Error loading rewards page',
      user: req.session.user || null
    });
  }
});

// ====================
// AUTHENTICATION ROUTES
// ====================

app.get('/login', authController.loginForm);
app.post('/login', validateLogin, authController.login);
app.get('/register', authController.registerForm);
app.post('/register', upload.single('Image'), validateRegistration, authController.register);
app.get('/logout', authController.logout);

// ====================
// AUTHENTICATED ROUTES (Require login)
// ====================

// Profile management
app.get('/profile', checkAuthenticated, authController.Profile);
app.post('/profile', checkAuthenticated, upload.single('Image'), authController.updateProfile);
app.post('/profile/change-password', checkAuthenticated, authController.changePassword);

// Quiz routes (require authentication)
app.post('/education/modules/:id/chapters/:chapterId/quiz', checkAuthenticated, modulesController.submitQuiz);
app.post('/education/modules/:id/chapters/:chapterId/complete', checkAuthenticated, modulesController.markChapterCompleted);

// Reward redemption (require authentication)
app.post('/rewards/:rewardId/redeem', checkAuthenticated, async (req, res) => {
  try {
    const rewardId = req.params.rewardId;
    const userId = req.session.user.id;
    
    // Check if reward exists and is active
    const rewardQuery = 'SELECT * FROM rewards WHERE RewardID = ? AND IsActive = 1';
    const rewardResults = await new Promise((resolve, reject) => {
      db.query(rewardQuery, [rewardId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (rewardResults.length === 0) {
      return res.status(404).json({ error: 'Reward not found or inactive' });
    }
    
    const reward = rewardResults[0];
    
    // Check if user has already redeemed this reward
    const existingRedemption = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM userrewards WHERE UserID = ? AND RewardID = ?', [userId, rewardId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (existingRedemption.length > 0) {
      return res.status(400).json({ error: 'You have already redeemed this reward' });
    }
    
    // Check user's token balance
    const tokenResults = await new Promise((resolve, reject) => {
      db.query('SELECT TokenBalance FROM usertokens WHERE UserID = ?', [userId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const userTokens = tokenResults[0]?.TokenBalance || 0;
    
    if (userTokens < reward.TokenCost) {
      return res.status(400).json({ error: 'Insufficient tokens' });
    }
    
    // Start transaction
    db.beginTransaction(async (err) => {
      if (err) {
        console.error('Transaction error:', err);
        return res.status(500).json({ error: 'Redemption failed' });
      }
      
      try {
        // Deduct tokens
        await new Promise((resolve, reject) => {
          db.query('UPDATE usertokens SET TokenBalance = TokenBalance - ? WHERE UserID = ?', [reward.TokenCost, userId], (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        
        // Add to user rewards
        await new Promise((resolve, reject) => {
          db.query('INSERT INTO userrewards (UserID, RewardID, RedeemedAt) VALUES (?, ?, NOW())', [userId, rewardId], (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        
        // Update reward quantity if applicable
        if (reward.QuantityAvailable > 0) {
          await new Promise((resolve, reject) => {
            db.query('UPDATE rewards SET QuantityAvailable = QuantityAvailable - 1 WHERE RewardID = ?', [rewardId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
        }
        
        db.commit((err) => {
          if (err) {
            db.rollback(() => {
              console.error('Commit error:', err);
              res.status(500).json({ error: 'Redemption failed' });
            });
          } else {
            res.json({ 
              success: true, 
              message: `Successfully redeemed ${reward.RewardName}!`,
              tokensSpent: reward.TokenCost
            });
          }
        });
      } catch (error) {
        db.rollback(() => {
          console.error('Redemption error:', error);
          res.status(500).json({ error: 'Redemption failed' });
        });
      }
    });
  } catch (error) {
    console.error('Redemption error:', error);
    res.status(500).json({ error: 'Redemption failed' });
  }
});

// ====================
// USER ROUTES (Require user role - RoleID = 2)
// ====================

// Protected user routes that require questionnaire completion
app.get('/user/dashboard', checkUser, checkQuestionnaire, userController.showDashboard);
app.get('/user/progress', checkUser, checkQuestionnaire, userController.showProgress);
app.get('/user/rewards', checkUser, checkQuestionnaire, userController.showRewards);
app.post('/user/rewards/:rewardId/redeem', checkUser, checkQuestionnaire, userController.redeemReward);
app.get('/user/profile/edit', checkUser, checkQuestionnaire, userController.editProfileForm);

// Questionnaire routes only need user authentication
app.get('/questionnaire', checkUser, userController.questionnaireForm);
app.post('/questionnaire', checkUser, userController.questionnaireResponse);

// ====================
// ADMIN ROUTES (Require admin role - RoleID = 1)
// ====================

// Admin dashboard
app.get('/admin', checkAdmin, adminController.showDashboard);
app.get('/admin/dashboard', checkAdmin, adminController.showDashboard);

// Admin user management
app.get('/admin/users', checkAdmin, adminController.getUsers);
app.get('/admin/users/add', checkAdmin, adminController.addUserForm);
app.post('/admin/users/add', checkAdmin, upload.single('Image'), adminController.addUser);
app.get('/admin/users/:id/edit', checkAdmin, adminController.editUserForm);
app.post('/admin/users/:id/edit', checkAdmin, upload.single('Image'), adminController.editUser);
app.post('/admin/users/:id/delete', checkAdmin, adminController.deleteUser);

// Admin module management
app.get('/admin/modules', checkAdmin, adminController.showModules);
app.get('/admin/modules/new', checkAdmin, adminController.showCreateModule);
app.post('/admin/modules', checkAdmin, adminController.createModule);
app.get('/admin/modules/:id/edit', checkAdmin, adminController.showEditModule);
app.post('/admin/modules/:id/edit', checkAdmin, adminController.updateModule);
app.delete('/admin/modules/:id', checkAdmin, adminController.deleteModule);

// Admin chapter management
app.get('/admin/modules/:id/chapters', checkAdmin, adminController.showModuleChapters);
app.get('/admin/modules/:id/chapters/new', checkAdmin, adminController.showCreateChapter);
app.post('/admin/modules/:id/chapters', checkAdmin, adminController.createChapter);
app.get('/admin/modules/:id/chapters/:chapterId/edit', checkAdmin, adminController.showEditChapter);
app.post('/admin/modules/:id/chapters/:chapterId/edit', checkAdmin, adminController.updateChapter);
app.delete('/admin/modules/:id/chapters/:chapterId', checkAdmin, adminController.deleteChapter);

// Admin reward management
app.get('/admin/rewards', checkAdmin, adminController.showRewards);
app.get('/admin/rewards/new', checkAdmin, adminController.showCreateReward);
app.post('/admin/rewards', checkAdmin, adminController.createReward);
app.get('/admin/rewards/:id/edit', checkAdmin, adminController.showEditReward);
app.post('/admin/rewards/:id/edit', checkAdmin, adminController.updateReward);
app.delete('/admin/rewards/:id', checkAdmin, adminController.deleteReward);

// ====================
// ERROR HANDLING
// ====================

//ON BACK LATER BELOW
// app.get('/401', (req, res) => {
//   res.status(401).render('error', { 
//     message: 'Access denied. You do not have permission to access this resource.',
//     user: req.session.user || null
//   });
// });

// // 404 handler
// app.use((req, res) => {
//   res.status(404).render('error', {
//     message: 'Page not found',
//     user: req.session.user || null
//   });
// });

// // General error handler
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).render('error', {
//     message: 'Something went wrong!',
//     user: req.session.user || null
//   });
// });
//ON BACK LATER ABOVE

// ====================
//Adelson's Feedback and AI Routes
// ====================
//AI routes
app.get('/ai', checkAuthenticated, AIController.getAIChat);
app.get('/ai-comparison', checkAuthenticated, AIController.getInsurancePlansComparison);
// Feedback routes
app.get('/feedback', checkAuthenticated, feedbackController.feedbackForm);
app.post('/feedback/submit', checkAuthenticated, upload.single('attachment'), feedbackController.submitFeedback);
// Admin Feedback Routes
app.get('/admin/feedback/:id', checkAuthenticated, checkAdmin, feedbackController.getFeedback);
app.post('/admin/feedback/:id/status', checkAuthenticated, checkAdmin, feedbackController.updateFeedbackStatus);
app.delete('/admin/feedback/:id', checkAuthenticated, checkAdmin, feedbackController.deleteFeedback);
// ====================
//END OF Adelson's Feedback and AI Routes
// ====================
// Admin insurance plans management
app.get('/admin/insurance-plans', checkAdmin, adminController.showInsurancePlans);
app.get('/admin/insurance-plans/new', checkAdmin, adminController.showCreateInsurancePlan);
app.post('/admin/insurance-plans', checkAdmin, adminController.createInsurancePlan);
app.get('/admin/insurance-plans/:id/edit', checkAdmin, adminController.showEditInsurancePlan);
app.post('/admin/insurance-plans/:id/edit', checkAdmin, adminController.updateInsurancePlan);
app.delete('/admin/insurance-plans/:id', checkAdmin, adminController.deleteInsurancePlan);

// Admin riders management
app.get('/admin/riders', checkAdmin, adminController.showRiders);
app.get('/admin/riders/new', checkAdmin, adminController.showCreateRider);
app.post('/admin/riders', checkAdmin, adminController.createRider);
app.get('/admin/riders/:id/edit', checkAdmin, adminController.showEditRider);
app.post('/admin/riders/:id/edit', checkAdmin, adminController.updateRider);
app.delete('/admin/riders/:id', checkAdmin, adminController.deleteRider);



// ====================
// DATABASE INITIALIZATION AND SERVER START
// ====================

// Database initialization function
async function initializeDatabase() {
  try {
    await new Promise((resolve, reject) => {
      db.query('SELECT 1', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ Database connection verified');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting +Pulse Education Platform...');
    
    // Initialize database
    const dbInitialized = await initializeDatabase();
    if (!dbInitialized) {
      console.error('❌ Failed to initialize database. Please check your MySQL connection.');
      console.log('💡 Make sure:');
      console.log('   1. MySQL server is running');
      console.log('   2. Database credentials in .env are correct');
      console.log('   3. Run the c300_fyp_polyfintech.sql script first');
      process.exit(1);
    }
    
    app.listen(port, () => {
      console.log(`✅ Server is running on http://localhost:${port}`);
      console.log('🌟 Visit http://localhost:3000/signup to create your account');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
