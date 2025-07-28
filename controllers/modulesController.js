// controllers/modulesController.js
const db = require('../db');

exports.showModules = async (req, res) => {
  try {
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
      
      // If user is logged in, get their progress for each module and token balance
      if (req.session.user) {
        const userId = req.session.user.id;
        
        // First get user token balance
        const userTokenQuery = `
          SELECT u.UserID, u.UserName, u.Email, u.RoleID, ut.TokenBalance, u.Image
          FROM user u
          LEFT JOIN usertokens ut ON u.UserID = ut.UserID
          WHERE u.UserID = ?
        `;
        
        db.query(userTokenQuery, [userId], (err, userResults) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).render('error', { 
              message: 'Error loading user data',
              user: req.session.user || null
            });
          }
          
          const userWithTokens = userResults[0] ? {
            ...req.session.user,
            tokens: userResults[0].TokenBalance || 0,
            profilePicUrl: (() => {
              const image = userResults[0].Image;
              if (!image || image === 'default-avatar.svg') {
                return '/images/default-avatar.svg';
              }
              // Handle both full paths and filenames
              if (image.startsWith('/images/')) {
                return image;
              }
              return '/images/users/' + image;
            })()
          } : req.session.user;
          
          // Then get progress data
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
                user: userWithTokens
              });
            }
            
            const progressMap = {};
            progressResults.forEach(p => {
              progressMap[p.ModuleID] = p;
            });
            
            const modulesWithProgress = modulesResults.map(module => ({
              id: module.ModuleID,
              title: module.Title,
              description: module.Description,
              badge: module.Badge,
              createdAt: module.CreatedAt,
              userProgress: progressMap[module.ModuleID] || {
                CompletionPercentage: 0,
                Completed: false
              }
            }));
            
            res.render('modules', { 
              modules: modulesWithProgress,
              user: userWithTokens
            });
          });
        });
      } else {
        const modules = modulesResults.map(module => ({
          id: module.ModuleID,
          title: module.Title,
          description: module.Description,
          badge: module.Badge,
          createdAt: module.CreatedAt
        }));
        
        res.render('modules', { 
          modules,
          user: req.session.user || null
        });
      }
    });
  } catch (error) {
    console.error('Modules error:', error);
    res.status(500).render('error', { 
      message: 'Error loading modules',
      user: req.session.user || null
    });
  }
};

exports.showModule = async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    const chapterId = parseInt(req.query.chapter) || parseInt(req.params.chapterId);
    
    // Get module details
    const moduleQuery = `
      SELECT ModuleID, Title, Description, Badge, CreatedAt
      FROM modules
      WHERE ModuleID = ?
    `;
    
    db.query(moduleQuery, [moduleId], (err, moduleResults) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).render('error', { 
          message: 'Error loading module',
          user: req.session.user || null
        });
      }
      
      if (moduleResults.length === 0) {
        return res.status(404).render('error', { 
          message: 'Module not found',
          user: req.session.user || null
        });
      }
      
      const module = moduleResults[0];
      
      // Get chapters for this module
      const chaptersQuery = `
        SELECT ChapterID, Title, Content, ChapterOrder, TokenReward
        FROM chapters
        WHERE ModuleID = ?
        ORDER BY ChapterOrder
      `;
      
      db.query(chaptersQuery, [moduleId], (err, chaptersResults) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).render('error', { 
            message: 'Error loading chapters',
            user: req.session.user || null
          });
        }
        
        const chapters = chaptersResults.map(chapter => ({
          id: chapter.ChapterID,
          title: chapter.Title,
          content: chapter.Content,
          order: chapter.ChapterOrder,
          token_reward: chapter.TokenReward
        }));
        
        if (chapters.length === 0) {
          return res.status(404).render('error', { 
            message: 'No chapters found for this module',
            user: req.session.user || null
          });
        }
        
        // Get current chapter (default to first chapter if not specified)
        const currentChapterId = chapterId || chapters[0].id;
        const currentChapter = chapters.find(c => c.id === currentChapterId);
        
        if (!currentChapter) {
          return res.status(404).render('error', { 
            message: 'Chapter not found',
            user: req.session.user || null
          });
        }
        
        if (req.session.user) {
          const userId = req.session.user.id;
          
          // First get user token balance
          const userTokenQuery = `
            SELECT u.UserID, u.UserName, u.Email, u.RoleID, ut.TokenBalance, u.Image
            FROM user u
            LEFT JOIN usertokens ut ON u.UserID = ut.UserID
            WHERE u.UserID = ?
          `;
          
          db.query(userTokenQuery, [userId], (err, userResults) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).render('error', { 
                message: 'Error loading user data',
                user: req.session.user || null
              });
            }
            
            const userWithTokens = userResults[0] ? {
              ...req.session.user,
              tokens: userResults[0].TokenBalance || 0,
              profilePicUrl: (() => {
                const image = userResults[0].Image;
                if (!image || image === 'default-avatar.svg') {
                  return '/images/default-avatar.svg';
                }
                // Handle both full paths and filenames
                if (image.startsWith('/images/')) {
                  return image;
                }
                return '/images/users/' + image;
              })()
            } : req.session.user;
          
            // Get user's progress for this module
            const moduleProgressQuery = `
              SELECT CompletionPercentage, Completed, LastUpdated
              FROM usermoduleprogress
              WHERE UserID = ? AND ModuleID = ?
            `;
            
            db.query(moduleProgressQuery, [userId, moduleId], (err, progressResults) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).render('error', { 
                  message: 'Error loading progress',
                  user: userWithTokens
                });
              }
              
              const userProgress = progressResults[0] || {
                CompletionPercentage: 0,
                Completed: false
              };
              
              // Get progress for all chapters in this module
              const chapterProgressQuery = `
                SELECT ChapterID, Completed, CompletedAt
                FROM userchapterprogress
                WHERE UserID = ? AND ChapterID IN (${chapters.map(() => '?').join(',')})
              `;
              
              db.query(chapterProgressQuery, [userId, ...chapters.map(c => c.id)], (err, chapterResults) => {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).render('error', { 
                    message: 'Error loading chapter progress',
                    user: userWithTokens
                  });
                }
                
                const chapterProgressMap = {};
                chapterResults.forEach(cp => {
                  chapterProgressMap[cp.ChapterID] = cp;
                });
                
                // Calculate overall progress
                const completedChapters = chapterResults.filter(p => p.Completed).length;
                const progress = chapters.length > 0 ? 
                  Math.round((completedChapters / chapters.length) * 100) : 0;
                
                // Add progress info to chapters for display
                const chaptersWithProgress = chapters.map(chapter => ({
                  ...chapter,
                  completed: chapterProgressMap[chapter.id]?.Completed || false
                }));

                // Get quiz questions for current chapter
                const quizQuery = `
                  SELECT QuestionID, Question, Answer
                  FROM quiz
                  WHERE ModuleID = ? AND ChapterID = ?
                  ORDER BY QuestionID
                `;
                
                db.query(quizQuery, [moduleId, currentChapterId], (err, quizResults) => {
                  if (err) {
                    console.error('Database error:', err);
                    return res.status(500).render('error', { 
                      message: 'Error loading quiz',
                      user: userWithTokens
                    });
                  }

                  res.render('module', {
                    module: {
                      id: module.ModuleID,
                      title: module.Title,
                      description: module.Description,
                      badge: module.Badge,
                      chapters: chaptersWithProgress,
                      quests: chaptersWithProgress // For compatibility with existing views
                    },
                    currentChapter: {
                      ...currentChapter,
                      completed: chapterProgressMap[currentChapter.id]?.Completed || false,
                      quiz: quizResults
                    },
                    currentChapterId,
                    progress,
                    userProgress,
                    user: userWithTokens
                  });
                });
              });
            });
          });
        } else {
          // No user logged in
          const chaptersWithProgress = chapters.map(chapter => ({
            ...chapter,
            completed: false
          }));

          res.render('module', {
            module: {
              id: module.ModuleID,
              title: module.Title,
              description: module.Description,
              badge: module.Badge,
              chapters: chaptersWithProgress,
              quests: chaptersWithProgress
            },
            currentChapter: {
              ...currentChapter,
              completed: false,
              quiz: []
            },
            currentChapterId,
            progress: 0,
            userProgress: null,
            user: req.session.user || null
          });
        }
      });
    });
  } catch (error) {
    console.error('Module error:', error);
    res.status(500).render('error', { 
      message: 'Error loading module',
      user: req.session.user || null
    });
  }
};

// Remove old quiz functions - now integrated into showModule

exports.submitQuiz = async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    const chapterId = parseInt(req.params.chapterId);
    const { answers } = req.body;
    
    if (!req.session.user) {
      return res.status(401).json({ error: 'Please log in to submit quiz' });
    }
    
    const userId = req.session.user.id;
    
    // Get quiz questions for this chapter
    const quizQuery = `
      SELECT QuestionID, Question, Answer
      FROM quiz
      WHERE ModuleID = ? AND ChapterID = ?
      ORDER BY QuestionID
    `;
    
    db.query(quizQuery, [moduleId, chapterId], (err, quizResults) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (quizResults.length === 0) {
        return res.status(404).json({ error: 'No quiz questions found for this chapter' });
      }
      
      // Calculate score
      let correctCount = 0;
      const totalQuestions = quizResults.length;
      
      quizResults.forEach((question, index) => {
        const userAnswer = answers[index];
        const correctAnswer = question.Answer || question.answer; // Handle both uppercase and lowercase
        
        // Convert string answers to boolean
        const userBool = userAnswer === 'true' || userAnswer === true;
        const correctBool = correctAnswer === 1 || correctAnswer === true;
        
        if (userBool === correctBool) {
          correctCount++;
        }
      });
      
      const score = Math.round((correctCount / totalQuestions) * 100);
      const passed = score >= 70;
      
      if (passed) {
        // Get chapter details for token reward
        const chapterQuery = `
          SELECT ChapterID, Title, TokenReward
          FROM chapters
          WHERE ChapterID = ? AND ModuleID = ?
        `;
        
        db.query(chapterQuery, [chapterId, moduleId], (err, chapterResults) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          if (chapterResults.length === 0) {
            return res.status(404).json({ error: 'Chapter not found' });
          }
          
          const chapter = chapterResults[0];
          const tokenReward = chapter.TokenReward || 10;
          
          // Check if user has already completed this chapter and earned tokens
          const checkCompletionQuery = `
            SELECT Completed, CompletedAt
            FROM userchapterprogress
            WHERE UserID = ? AND ChapterID = ?
          `;
          
          db.query(checkCompletionQuery, [userId, chapterId], (err, completionResults) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Error checking completion status' });
            }
            
            const alreadyCompleted = completionResults.length > 0 && completionResults[0].Completed;
            let tokensEarned = 0;
            let message = '';
            
            // Mark chapter as completed
            const markCompletedQuery = `
              INSERT INTO userchapterprogress (UserID, ChapterID, Completed, CompletedAt)
              VALUES (?, ?, 1, NOW())
              ON DUPLICATE KEY UPDATE 
                Completed = 1, 
                CompletedAt = CASE 
                  WHEN Completed = 0 THEN NOW() 
                  ELSE CompletedAt 
                END
            `;
            
            db.query(markCompletedQuery, [userId, chapterId], (err) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Error marking chapter as completed' });
              }
              
              // Only award tokens if user hasn't completed this chapter before
              if (!alreadyCompleted) {
                tokensEarned = tokenReward;
                message = `Chapter completed! You earned ${tokenReward} tokens!`;
                
                // Award tokens
                const updateTokensQuery = `
                  INSERT INTO usertokens (UserID, TokenBalance, LastUpdated)
                  VALUES (?, ?, NOW())
                  ON DUPLICATE KEY UPDATE 
                    TokenBalance = TokenBalance + ?, 
                    LastUpdated = NOW()
                `;
                
                db.query(updateTokensQuery, [userId, tokenReward, tokenReward], (err) => {
                  if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Error updating tokens' });
                  }
                  
                  // Update session
                  req.session.user.tokens = (req.session.user.tokens || 0) + tokenReward;
                  
                  // Continue with module progress check
                  checkModuleCompletion();
                });
              } else {
                message = 'Chapter completed! (No tokens awarded - already completed)';
                // Continue with module progress check without awarding tokens
                checkModuleCompletion();
              }
              
              function checkModuleCompletion() {
                const getAllChaptersQuery = `
                  SELECT ChapterID
                  FROM chapters
                  WHERE ModuleID = ?
                `;
                
                db.query(getAllChaptersQuery, [moduleId], (err, allChaptersResults) => {
                  if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Error getting chapters' });
                  }
                  
                  const getCompletedChaptersQuery = `
                    SELECT COUNT(*) as CompletedCount
                    FROM userchapterprogress ucp
                    JOIN chapters c ON ucp.ChapterID = c.ChapterID
                    WHERE ucp.UserID = ? AND c.ModuleID = ? AND ucp.Completed = 1
                  `;
                  
                  db.query(getCompletedChaptersQuery, [userId, moduleId], (err, completedResults) => {
                    if (err) {
                      console.error('Database error:', err);
                      return res.status(500).json({ error: 'Error getting completed chapters' });
                    }
                    
                    const totalChapters = allChaptersResults.length;
                    const completedCount = completedResults[0].CompletedCount;
                    const completionPercentage = totalChapters > 0 ? (completedCount / totalChapters) * 100 : 0;
                    const moduleCompleted = completionPercentage === 100;
                    
                    // Check if module was already completed to prevent duplicate bonus
                    let bonusTokens = 0;
                    if (moduleCompleted && completedCount === totalChapters) {
                      // Check if user already completed this module and got bonus
                      const checkModuleCompletionQuery = `
                        SELECT Completed, LastUpdated
                        FROM usermoduleprogress
                        WHERE UserID = ? AND ModuleID = ? AND Completed = 1
                      `;
                      
                      db.query(checkModuleCompletionQuery, [userId, moduleId], (err, moduleCompletionResults) => {
                        if (err) {
                          console.error('Database error:', err);
                          return res.status(500).json({ error: 'Error checking module completion' });
                        }
                        
                        const moduleAlreadyCompleted = moduleCompletionResults.length > 0;
                        
                        if (!moduleAlreadyCompleted) {
                          bonusTokens = 30;
                          
                          // Award bonus tokens only if module wasn't completed before
                          const bonusTokensQuery = `
                            UPDATE usertokens 
                            SET TokenBalance = TokenBalance + ?, LastUpdated = NOW()
                            WHERE UserID = ?
                          `;
                          
                          db.query(bonusTokensQuery, [bonusTokens, userId], (err) => {
                            if (err) {
                              console.error('Error awarding bonus tokens:', err);
                              bonusTokens = 0; // Reset bonus if error
                            }
                            // Continue with module progress update
                            updateModuleProgressAndRespond();
                          });
                        } else {
                          // Module was already completed, no bonus tokens
                          updateModuleProgressAndRespond();
                        }
                      });
                    } else {
                      // Continue with module progress update
                      updateModuleProgressAndRespond();
                    }
                    
                    function updateModuleProgressAndRespond() {
                      // Update session with all tokens (base + bonus)
                      req.session.user.tokens = (req.session.user.tokens || 0) + bonusTokens;
                    
                      // Update module progress
                      const updateModuleProgressQuery = `
                        INSERT INTO usermoduleprogress (UserID, ModuleID, CompletionPercentage, Completed, LastUpdated)
                        VALUES (?, ?, ?, ?, NOW())
                        ON DUPLICATE KEY UPDATE 
                          CompletionPercentage = ?, 
                          Completed = ?, 
                          LastUpdated = NOW()
                      `;
                      
                      db.query(updateModuleProgressQuery, [
                        userId, moduleId, completionPercentage, moduleCompleted,
                        completionPercentage, moduleCompleted
                      ], (err) => {
                        if (err) {
                          console.error('Database error:', err);
                          return res.status(500).json({ error: 'Error updating module progress' });
                        }
                        
                        let finalMessage = message;
                        if (bonusTokens > 0) {
                          finalMessage += ` Plus ${bonusTokens} bonus tokens for completing the entire module!`;
                        }
                        
                        res.json({
                          success: true,
                          score,
                          passed,
                          tokensEarned: tokensEarned + bonusTokens,
                          moduleCompleted,
                          message: finalMessage
                        });
                      });
                    }
                  });
                });
              } // <-- This closing brace was missing
            });
          });
        });
      } else {
        res.json({
          success: false,
          score,
          passed,
          tokensEarned: 0,
          message: `You scored ${score}%. You need at least 70% to pass. Try again!`
        });
      }
    });
  } catch (error) {
    console.error('Quiz submission error:', error);
    res.status(500).json({ error: 'Error submitting quiz' });
  }
};

// Mark chapter as completed (for chapters without quizzes)
exports.markChapterCompleted = async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    const chapterId = parseInt(req.params.chapterId);
    
    if (!req.session.user) {
      return res.status(401).json({ error: 'Please log in to mark chapter as completed' });
    }
    
    const userId = req.session.user.id;
    
    // Get chapter details for token reward
    const chapterQuery = `
      SELECT ChapterID, Title, TokenReward
      FROM chapters
      WHERE ChapterID = ? AND ModuleID = ?
    `;
    
    db.query(chapterQuery, [chapterId, moduleId], (err, chapterResults) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (chapterResults.length === 0) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      
      const chapter = chapterResults[0];
      const tokenReward = chapter.TokenReward || 5; // Lower reward for chapters without quiz
      
      // Check if user has already completed this chapter and earned tokens
      const checkCompletionQuery = `
        SELECT Completed, CompletedAt
        FROM userchapterprogress
        WHERE UserID = ? AND ChapterID = ?
      `;
      
      db.query(checkCompletionQuery, [userId, chapterId], (err, completionResults) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Error checking completion status' });
        }
        
        const alreadyCompleted = completionResults.length > 0 && completionResults[0].Completed;
        let tokensEarned = 0;
        let message = '';
        
        // Mark chapter as completed
        const markCompletedQuery = `
          INSERT INTO userchapterprogress (UserID, ChapterID, Completed, CompletedAt)
          VALUES (?, ?, 1, NOW())
          ON DUPLICATE KEY UPDATE 
            Completed = 1, 
            CompletedAt = CASE 
              WHEN Completed = 0 THEN NOW() 
              ELSE CompletedAt 
            END
        `;
        
        db.query(markCompletedQuery, [userId, chapterId], (err) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Error marking chapter as completed' });
          }
          
          // Only award tokens if user hasn't completed this chapter before
          if (!alreadyCompleted) {
            tokensEarned = tokenReward;
            message = `Chapter completed! You earned ${tokenReward} tokens!`;
            
            // Award tokens
            const updateTokensQuery = `
              INSERT INTO usertokens (UserID, TokenBalance, LastUpdated)
              VALUES (?, ?, NOW())
              ON DUPLICATE KEY UPDATE 
                TokenBalance = TokenBalance + ?, 
                LastUpdated = NOW()
            `;
            
            db.query(updateTokensQuery, [userId, tokenReward, tokenReward], (err) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Error updating tokens' });
              }
              
              // Update session
              req.session.user.tokens = (req.session.user.tokens || 0) + tokenReward;
              
              res.json({
                success: true,
                tokensEarned: tokensEarned,
                message: message
              });
            });
          } else {
            message = 'Chapter completed! (No tokens awarded - already completed)';
            
            res.json({
              success: true,
              tokensEarned: 0,
              message: message
            });
          }
        });
      });
    });
  } catch (error) {
    console.error('Mark chapter completed error:', error);
    res.status(500).json({ error: 'Error marking chapter as completed' });
  }
};

