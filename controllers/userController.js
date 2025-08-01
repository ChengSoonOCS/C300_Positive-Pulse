const session = require('express-session');
const db = require('../db');

exports.showDashboard = async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get user info with token balance
    const userQuery = `
      SELECT u.UserID, u.UserName, u.Email, u.CreationDate, u.Image, 
             ut.TokenBalance, r.RoleName as role
      FROM user u
      LEFT JOIN usertokens ut ON u.UserID = ut.UserID
      LEFT JOIN role r ON u.RoleID = r.RoleID
      WHERE u.UserID = ?
    `;
    
    db.query(userQuery, [userId], (err, userResults) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).render('error', { 
          message: 'Error loading dashboard',
          user: req.session.user || null
        });
      }
      
      const user = userResults[0];
      if (!user) {
        return res.status(404).render('error', { 
          message: 'User not found',
          user: req.session.user || null
        });
      }

      // Get all modules
      const modulesQuery = `
        SELECT ModuleID, Title, Description, Badge, CreatedAt
        FROM modules
        ORDER BY CreatedAt DESC
      `;
      
      db.query(modulesQuery, (err, modulesResults) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).render('error', { 
            message: 'Error loading modules',
            user: req.session.user || null
          });
        }

        // Get user progress for all modules
        const progressQuery = `
          SELECT ModuleID, CompletionPercentage, Completed, LastUpdated
          FROM usermoduleprogress
          WHERE UserID = ?
        `;
        
        db.query(progressQuery, [userId], (err, progressResults) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).render('error', { 
              message: 'Error loading progress',
              user: req.session.user || null
            });
          }

          // Get chapter counts for each module
          const chapterCountQuery = `
            SELECT ModuleID, COUNT(*) as ChapterCount
            FROM chapters
            GROUP BY ModuleID
          `;
          
          db.query(chapterCountQuery, (err, chapterResults) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).render('error', { 
                message: 'Error loading chapters',
                user: req.session.user || null
              });
            }

            // Get completed chapters count for user
            const completedChaptersQuery = `
              SELECT c.ModuleID, COUNT(*) as CompletedChapters
              FROM userchapterprogress ucp
              JOIN chapters c ON ucp.ChapterID = c.ChapterID
              WHERE ucp.UserID = ? AND ucp.Completed = 1
              GROUP BY c.ModuleID
            `;
            
            db.query(completedChaptersQuery, [userId], (err, completedResults) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).render('error', { 
                  message: 'Error loading completed chapters',
                  user: req.session.user || null
                });
              }

              // Get total completed chapters across all modules
              const totalCompletedChaptersQuery = `
                SELECT COUNT(*) as TotalCompletedChapters
                FROM userchapterprogress ucp
                JOIN chapters c ON ucp.ChapterID = c.ChapterID
                WHERE ucp.UserID = ? AND ucp.Completed = 1
              `;
              
              db.query(totalCompletedChaptersQuery, [userId], (err, totalCompletedResults) => {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).render('error', { 
                    message: 'Error loading total completed chapters',
                    user: req.session.user || null
                  });
                }

                // Process data for rendering
                const progressMap = {};
                progressResults.forEach(p => {
                  progressMap[p.ModuleID] = p;
                });

                const chapterCountMap = {};
                chapterResults.forEach(c => {
                  chapterCountMap[c.ModuleID] = c.ChapterCount;
                });

                // Create completed chapters map
                const completedChaptersMap = {};
                completedResults.forEach(cc => {
                  completedChaptersMap[cc.ModuleID] = cc.CompletedChapters;
                });

                const modulesWithProgress = modulesResults.map(module => {
                  const totalChapters = chapterCountMap[module.ModuleID] || 0;
                  const completedChapters = completedChaptersMap[module.ModuleID] || 0;
                  const realProgress = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
                  const isCompleted = totalChapters > 0 && completedChapters === totalChapters;

                  return {
                    id: module.ModuleID,
                    title: module.Title,
                    description: module.Description,
                    badge: module.Badge,
                    progress: {
                      completed: isCompleted,
                      score: realProgress
                    },
                    questCompletion: {
                      completed: completedChapters,
                      total: totalChapters
                    }
                  };
                });

                // Calculate overall statistics
                const totalModules = modulesResults.length;
                const completedModules = modulesWithProgress.filter(m => m.progress.completed).length;
                const totalChapters = chapterResults.reduce((sum, c) => sum + c.ChapterCount, 0);
                const totalCompletedChapters = totalCompletedResults[0].TotalCompletedChapters;

                // Recent activity (placeholder)
                const recentActivity = [
                  {
                    type: 'module_completed',
                    message: 'Great progress on your learning journey!',
                    timestamp: new Date().toISOString()
                  }
                ];

                // Get user's redeemed rewards for dashboard preview
                const redeemedQuery = `
                  SELECT r.RewardID, r.RewardName, r.Description, r.TokenCost, r.RewardImage, ur.RedeemedAt
                  FROM userrewards ur
                  JOIN rewards r ON ur.RewardID = r.RewardID
                  WHERE ur.UserID = ?
                  ORDER BY ur.RedeemedAt DESC
                  LIMIT 3
                `;
                db.query(redeemedQuery, [userId], (err, redeemedResults) => {
                  let redeemedRewards = [];
                  if (!err && redeemedResults && redeemedResults.length > 0) {
                    redeemedRewards = redeemedResults.map(reward => ({
                      name: reward.RewardName,
                      description: reward.Description,
                      cost: reward.TokenCost,
                      image: reward.RewardImage,
                      redeemedAt: reward.RedeemedAt
                    }));
                  }
                  res.render('user/dashboard', {
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
                      })()
                    },
                    stats: {
                      totalModules,
                      completedModules,
                      totalChapters,
                      completedChapters: totalCompletedChapters,
                      completionRate: totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0,
                      tokens: user.TokenBalance || 0
                    },
                    modules: modulesWithProgress,
                    recentActivity,
                    redeemedRewards
                  });
                });
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { 
      message: 'Error loading dashboard',
      user: req.session.user || null
    });
  }
};

exports.showRewards = (req, res) => {
    try {
        // Get user's complete data including token balance
        const userQuery = `
            SELECT u.UserID, u.UserName, u.Email, u.RoleID, ut.TokenBalance
            FROM user u
            LEFT JOIN usertokens ut ON u.UserID = ut.UserID
            WHERE u.UserID = ?
        `;

        db.query(userQuery, [req.session.user.id], (err, userResults) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).render('error', {
                    message: 'Error loading user data',
                    user: req.session.user || null
                });
            }

            const user = userResults[0];
            if (!user) {
                return res.status(404).render('error', {
                    message: 'User not found',
                    user: req.session.user || null
                });
            }

            // Get all available rewards
            const rewardsQuery = `
                SELECT RewardID, RewardName, Description, TokenCost, QuantityAvailable, RewardImage
                FROM rewards
                WHERE IsActive = 1
                ORDER BY TokenCost ASC
            `;

            db.query(rewardsQuery, (err, rewardsResults) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).render('error', {
                        message: 'Error loading rewards',
                        user: req.session.user || null
                    });
                }

                // Get user's redeemed rewards
                const redeemedQuery = `
                    SELECT r.RewardID, r.RewardName, r.TokenCost, r.RewardImage, ur.RedeemedAt
                    FROM userrewards ur
                    JOIN rewards r ON ur.RewardID = r.RewardID
                    WHERE ur.UserID = ?
                    ORDER BY ur.RedeemedAt DESC
                `;

                db.query(redeemedQuery, [req.session.user.id], (err, redeemedResults) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).render('error', {
                            message: 'Error loading redeemed rewards',
                            user: req.session.user || null
                        });
                    }

                    // Helper function to get icon based on reward name
                    const getRewardIcon = (rewardName) => {
                        const name = rewardName.toLowerCase();
                        if (name.includes('coffee')) return '☕';
                        if (name.includes('movie')) return '🎬';
                        if (name.includes('gift')) return '🎁';
                        if (name.includes('discount')) return '💰';
                        return '🏆';
                    };

                    const rewardsWithIcons = rewardsResults.map(reward => ({
                        id: reward.RewardID,
                        name: reward.RewardName,
                        description: reward.Description,
                        cost: reward.TokenCost,
                        available: reward.QuantityAvailable,
                        icon: getRewardIcon(reward.RewardName)
                    }));

                    const redeemedRewards = redeemedResults.map(reward => ({
                        name: reward.RewardName,
                        cost: reward.TokenCost,
                        redeemedAt: reward.RedeemedAt
                    }));

                    res.render('user/rewards', {
                        user: {
                            ...user,
                            id: user.UserID,
                            username: user.UserName,
                            coins: user.TokenBalance || 0
                        },
                        availableRewards: rewardsWithIcons,
                        redeemedRewards
                    });
                });
            });
        });
    } catch (error) {
        console.error('Rewards error:', error);
        res.status(500).render('error', {
            message: 'Error loading rewards',
            user: req.session.user || null
        });
    }
};

exports.redeemReward = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const rewardId = parseInt(req.params.rewardId);
    
    // Get reward details
    const rewardQuery = `
      SELECT RewardID, RewardName, TokenCost, QuantityAvailable, IsActive
      FROM rewards
      WHERE RewardID = ?
    `;
    
    db.query(rewardQuery, [rewardId], (err, rewardResults) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      const reward = rewardResults[0];
      if (!reward) {
        return res.status(404).json({ error: 'Reward not found' });
      }

      if (!reward.IsActive || reward.QuantityAvailable <= 0) {
        return res.status(400).json({ error: 'Reward not available' });
      }

      // Check user's token balance
      const userQuery = `
        SELECT TokenBalance
        FROM usertokens
        WHERE UserID = ?
      `;
      
      db.query(userQuery, [userId], (err, userResults) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        const userTokens = userResults[0]?.TokenBalance || 0;
        
        if (userTokens < reward.TokenCost) {
          return res.status(400).json({ error: 'Insufficient tokens' });
        }

        // Start transaction
        db.beginTransaction((err) => {
          if (err) {
            console.error('Transaction error:', err);
            return res.status(500).json({ error: 'Transaction error' });
          }

          // Deduct tokens
          const deductTokensQuery = `
            UPDATE usertokens 
            SET TokenBalance = TokenBalance - ?, LastUpdated = NOW()
            WHERE UserID = ?
          `;
          
          db.query(deductTokensQuery, [reward.TokenCost, userId], (err) => {
            if (err) {
              return db.rollback(() => {
                console.error('Database error:', err);
                res.status(500).json({ error: 'Failed to deduct tokens' });
              });
            }

            // Record the redemption
            const redeemQuery = `
              INSERT INTO userrewards (UserID, RewardID, RedeemedAt)
              VALUES (?, ?, NOW())
            `;
            
            db.query(redeemQuery, [userId, rewardId], (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error('Database error:', err);
                  res.status(500).json({ error: 'Failed to record redemption' });
                });
              }

              // Update reward quantity
              const updateQuantityQuery = `
                UPDATE rewards 
                SET QuantityAvailable = QuantityAvailable - 1
                WHERE RewardID = ?
              `;
              
              db.query(updateQuantityQuery, [rewardId], (err) => {
                if (err) {
                  return db.rollback(() => {
                    console.error('Database error:', err);
                    res.status(500).json({ error: 'Failed to update quantity' });
                  });
                }

                db.commit((err) => {
                  if (err) {
                    return db.rollback(() => {
                      console.error('Commit error:', err);
                      res.status(500).json({ error: 'Transaction failed' });
                    });
                  }

                  // Update session
                  req.session.user.tokens = userTokens - reward.TokenCost;

                  res.json({ 
                    success: true, 
                    message: `Successfully redeemed ${reward.RewardName}!`,
                    remainingTokens: userTokens - reward.TokenCost
                  });
                });
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('Reward redemption error:', error);
    res.status(500).json({ error: 'Failed to redeem reward' });
  }
};

exports.showProgress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get user info
    const userQuery = `
      SELECT u.UserID, u.UserName, u.Email, ut.TokenBalance
      FROM user u
      LEFT JOIN usertokens ut ON u.UserID = ut.UserID
      WHERE u.UserID = ?
    `;
    
    db.query(userQuery, [userId], (err, userResults) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).render('error', { 
          message: 'Error loading progress',
          user: req.session.user || null
        });
      }
      
      const user = userResults[0];
      if (!user) {
        return res.status(404).render('error', { 
          message: 'User not found',
          user: req.session.user || null
        });
      }

      // Get modules with progress
      const modulesQuery = `
        SELECT m.ModuleID, m.Title, m.Description, m.Badge,
               ump.CompletionPercentage, ump.Completed, ump.LastUpdated
        FROM modules m
        LEFT JOIN usermoduleprogress ump ON m.ModuleID = ump.ModuleID AND ump.UserID = ?
        ORDER BY m.CreatedAt DESC
      `;
      
      db.query(modulesQuery, [userId], (err, modulesResults) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).render('error', { 
            message: 'Error loading modules',
            user: req.session.user || null
          });
        }

        // Get chapter progress
        const chapterProgressQuery = `
          SELECT c.ChapterID, c.ModuleID, c.Title, c.ChapterOrder,
                 ucp.Completed, ucp.CompletedAt
          FROM chapters c
          LEFT JOIN userchapterprogress ucp ON c.ChapterID = ucp.ChapterID AND ucp.UserID = ?
          ORDER BY c.ModuleID, c.ChapterOrder
        `;
        
        db.query(chapterProgressQuery, [userId], (err, chapterResults) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).render('error', { 
              message: 'Error loading chapter progress',
              user: req.session.user || null
            });
          }

          // Group chapters by module
          const chaptersByModule = {};
          chapterResults.forEach(chapter => {
            if (!chaptersByModule[chapter.ModuleID]) {
              chaptersByModule[chapter.ModuleID] = [];
            }
            chaptersByModule[chapter.ModuleID].push({
              id: chapter.ChapterID,
              title: chapter.Title,
              order: chapter.ChapterOrder,
              completed: chapter.Completed,
              completedAt: chapter.CompletedAt
            });
          });

          // Process modules with chapter progress
          const progressData = modulesResults.map(module => {
            const chapters = chaptersByModule[module.ModuleID] || [];
            const completedChapters = chapters.filter(c => c.completed).length;
            
            return {
              id: module.ModuleID,
              title: module.Title,
              description: module.Description,
              badge: module.Badge,
              progress: {
                percentage: module.CompletionPercentage || 0,
                completed: module.Completed || false,
                lastUpdated: module.LastUpdated
              },
              chapters,
              completedChapters,
              totalChapters: chapters.length
            };
          });

          // Calculate overall stats
          const totalModules = progressData.length;
          const completedModules = progressData.filter(m => m.progress.completed).length;
          const totalChapters = progressData.reduce((sum, m) => sum + m.totalChapters, 0);
          const completedChapters = progressData.reduce((sum, m) => sum + m.completedChapters, 0);

          const stats = {
            totalModules,
            completedModules,
            totalChapters,
            completedChapters,
            completionRate: totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0
          };

          res.render('user/progress', {
            user: {
              ...user,
              id: user.UserID,
              username: user.UserName,
              tokens: user.TokenBalance || 0
            },
            modules: progressData,
            stats
          });
        });
      });
    });
  } catch (error) {
    console.error('Progress error:', error);
    res.status(500).render('error', { 
      message: 'Error loading progress',
      user: req.session.user || null
    });
  }
};

exports.showProfile = async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const userQuery = `
      SELECT u.UserID, u.UserName, u.Email, u.Contact, u.Address, u.CreationDate,
             ut.TokenBalance, r.RoleName as role
      FROM user u
      LEFT JOIN usertokens ut ON u.UserID = ut.UserID
      LEFT JOIN role r ON u.RoleID = r.RoleID
      WHERE u.UserID = ?
    `;
    
    db.query(userQuery, [userId], (err, results) => {
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

      res.render('user/profile', {
        user: {
          ...user,
          id: user.UserID,
          username: user.UserName,
          email: user.Email,
          tokens: user.TokenBalance || 0,
          creationDate: user.CreationDate
        }
      });
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).render('error', { 
      message: 'Error loading profile',
      user: req.session.user || null
    });
  }
};

// Helper function to get reward icons
function getRewardIcon(rewardName) {
  const icons = {
    'Coffee Voucher': '☕',
    'Lunch Voucher': '🍽️',
    'Bookstore Credit': '📚',
    'Parking Pass': '🅿️',
    'Study Room Access': '📖',
    'Late Library Access': '🏛️'
  };
  return icons[rewardName] || '🎁';
}


exports.questionnaireForm = (req, res) => {
    // Check if questionnaire is already completed
    const userQuery = 'SELECT QuestionnaireID FROM user WHERE UserID = ?';
    db.query(userQuery, [req.session.user.id], (err, results) => {
        if (err) {
            console.error('Questionnaire check error:', err);
            return res.redirect('/user/dashboard');
        }
        
        // If questionnaire is already completed, redirect to dashboard
        if (results[0]?.QuestionnaireID) {
            return res.redirect('/user/dashboard');
        }
        
        // Show questionnaire form
        res.render('questionnaire', {
            user: req.session.user,
            error: null
        });
    });
};

exports.questionnaireResponse = (req, res) => {
    const userId = req.session.user.id;
    const {
        occupation,
        healthCondition,
        smoke,
        QuestionName,
        Version,
        Description
    } = req.body;

    // Start transaction
    db.beginTransaction((err) => {
        if (err) {
            console.error('Transaction start error:', err);
            return res.render('questionnaire', {
                user: req.session.user,
                error: 'Failed to submit questionnaire. Please try again.'
            });
        }

        // 1. Insert into questionnaireresponse
        const responseData = JSON.stringify({
            occupation,
            healthCondition,
            smoke
        });

        const insertResponseQuery = 'INSERT INTO questionnaireresponse (WhenSubmitted, Response) VALUES (NOW(), ?)';
        db.query(insertResponseQuery, [responseData], (err, responseResult) => {
            if (err) {
                return db.rollback(() => {
                    console.error('Response insert error:', err);
                    res.render('questionnaire', {
                        user: req.session.user,
                        error: 'Failed to submit questionnaire. Please try again.'
                    });
                });
            }

            const questionnaireResponseId = responseResult.insertId;

            // 2. Update user with QuestionnaireResponseID
            const updateUserQuery = 'UPDATE user SET QuestionnaireID = ? WHERE UserID = ?';
            db.query(updateUserQuery, [questionnaireResponseId, userId], (err) => {
                if (err) {
                    return db.rollback(() => {
                        console.error('User update error:', err);
                        res.render('questionnaire', {
                            user: req.session.user,
                            error: 'Failed to submit questionnaire. Please try again.'
                        });
                    });
                }

                // 3. Insert into questionnaires
                const insertQuestionnaireQuery = `
                    INSERT INTO questionnaires (
                        QuestionName,
                        Version,
                        Description,
                        CreationDate,
                        QuestionnaireResponseID
                    ) VALUES (?, ?, ?, NOW(), ?)
                `;

                db.query(
                    insertQuestionnaireQuery,
                    [QuestionName, Version, Description, questionnaireResponseId],
                    (err) => {
                        if (err) {
                            return db.rollback(() => {
                                console.error('Questionnaire insert error:', err);
                                res.render('questionnaire', {
                                    user: req.session.user,
                                    error: 'Failed to submit questionnaire. Please try again.'
                                });
                            });
                        }

                        // Commit transaction
                        db.commit((err) => {
                            if (err) {
                                return db.rollback(() => {
                                    console.error('Commit error:', err);
                                    res.render('questionnaire', {
                                        user: req.session.user,
                                        error: 'Failed to submit questionnaire. Please try again.'
                                    });
                                });
                            }

                            // Update session to reflect questionnaire completion
                            if (req.session.user) {
                                req.session.user.questionnaireCompleted = true;
                            }

                            // Redirect to dashboard after successful submission
                            req.flash('success', 'Questionnaire completed successfully!');
                            res.redirect('/user/dashboard');
                        });
                    }
                );
            });
        });
    });
};

exports.profile = (req, res) => {
    const userId = req.session.user.UserID;
    const Usql = 'SELECT * FROM user WHERE UserID = ?';
    console.log("User ID: " + userId);
    // Fetch data from MySQL
    db.query(Usql, [userId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving user');
        }
        const Qsql = `
        SELECT QuestionName, Response FROM questionnaires Q 
        INNER JOIN questionnaireresponse QR ON Q.QuestionnaireResponseID = QR.QuestionnaireResponseID 
        INNER JOIN user U ON QR.QuestionnaireResponseID = U.QuestionnaireID WHERE UserID = ?
        `;
        db.query(Qsql, [userId], (error, result) => {
            if (error) {
                console.error('Database query error:', error.message);
                return res.status(500).send('Error retrieving user questionnaire responses');
            }
            if (results.length > 0) {
                console.log('All users:', results);
                console.log('User Response:', result[0]);
                res.render('profile', { userProfile: results[0], userResponses: result[0]});
            } else {
                // If no user with the given ID was found, 
                //render a 404 page or handle it accordingly
                res.status(404).send('No User Found', userId);
            }
        });
    })
};

exports.editProfileForm = (req, res) => {
    const userId = req.session.user.UserID;
    const sql = 'SELECT * FROM user WHERE UserID = ?';

    db.query(sql, [userId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving user by ID');
        }
        // Check if any user with the given ID was found
        if (results.length > 0) {
            // Render profile page with the user data and URL parameters for messages
            const userProfile = results[0];
            res.render('profile', { 
                user: {
                    ...userProfile,
                    username: userProfile.UserName,
                    email: userProfile.Email,
                    profilePicUrl: userProfile.Image ? '/images/users/' + userProfile.Image : '/images/default-avatar.svg',
                    role: req.session.user.role || 'user'
                },
                error: req.query.error || null,
                success: req.query.success || null
            });
        } else {
            // If no user with the given ID was found, 
            //render a 404 page or handle it accordingly
            res.status(404).send('User not found');
        }
    });

};

exports.editProfile = (req, res) => {
    const userId = req.session.user.UserID;
    const { UserName, Email, Contact, Address } = req.body;

    // Check if username is already taken by another user
    const checkUsernameQuery = 'SELECT UserID FROM user WHERE UserName = ? AND UserID != ?';
    db.query(checkUsernameQuery, [UserName, userId], (err, results) => {
        if (err) {
            console.error('Username check error:', err);
            return res.redirect('/user/profile/edit?error=Database error occurred');
        }
        
        // If username exists and belongs to another user
        if (results.length > 0) {
            return res.redirect('/user/profile/edit?error=Username is already taken. Please choose a different username.');
        }

        let Image = req.session.user.Image;
        if (req.file) {
            Image = req.file.filename;
        }
        const sql = `UPDATE user set 
        UserName = ?, Email = ?, Contact = ?, Address = ?, Image = ? WHERE UserID = ?
        `;
        db.query(sql, [UserName, Email, Contact, Address, Image, userId], (err, result) => {
            if (err) {
                console.error('Update profile error:', err);
                return res.redirect('/user/profile/edit?error=Failed to update profile. Please try again.');
            }
            // Update session with new profile data so changes reflect immediately
            req.session.user.UserName = UserName;
            req.session.user.Email = Email;
            req.session.user.Contact = Contact;
            req.session.user.Address = Address;
            if (Image) {
                req.session.user.Image = Image;
            }
            console.log(result);
            res.redirect('/user/dashboard?success=Profile updated successfully!');
        });
    });
};

exports.deleteProfile = (req, res) => {
    const userId = req.session.user.UserID;
    const qsql = `
    DELETE FROM questionnaires
    WHERE QuestionnaireResponseID = (SELECT QuestionnaireID FROM user WHERE UserID = ?)
    `;
    const qrsql = `
    DELETE FROM questionnaireresponse 
    WHERE QuestionnaireResponseID = (SELECT QuestionnaireID FROM user WHERE UserID = ?)`;
    const usql = `DELETE FROM user WHERE UserID = ?`;
    db.query(qsql, [userId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting questionnaire", error);
            res.status(500).send('Error deleting questionnaire');
        }
        db.query(qrsql, [userId], (error, results) => {
            if (error) {
                // Handle any error that occurs during the database operation
                console.error("Error deleting questionnaire response:", error);
                res.status(500).send('Error deleting questionnaire response');
            }
            db.query(usql, [userId], (error, results) => {
                if (error) {
                    // Handle any error that occurs during the database operation
                    console.error("Error deleting user:", error);
                    res.status(500).send('Error deleting user');
                } else {
                    // Send a success response
                    req.flash('success', 'Profile deleted successfully. You have been logged out.');
                    res.redirect('/logout');
                }
            });
        });
    });
};
