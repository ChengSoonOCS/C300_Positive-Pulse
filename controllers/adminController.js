const db = require('../db');
const bcrypt = require('bcrypt');

// Helper function to ensure user object has profilePicUrl for navbar
const getUserWithProfilePic = (sessionUser) => {
  if (!sessionUser) return null;
  
  return {
    ...sessionUser,
    profilePicUrl: (() => {
      const image = sessionUser.image || sessionUser.Image;
      if (!image || image === 'default-avatar.svg') {
        return '/images/default-avatar.svg';
      }
      // Handle both full paths and filenames
      if (image.startsWith('/images/')) {
        return image;
      }
      return '/images/users/' + image;
    })()
  };
};

// Middleware to check admin requirements
exports.requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.RoleID !== 1) {
    return res.status(403).render('error', {
      message: 'Admin access required',
      user: getUserWithProfilePic(req.session.user)
    });
  }
  next();
};

// Dashboard
exports.showDashboard = async (req, res) => {
  try {
    // Get statistics for dashboard
    const statsPromises = [
      new Promise((resolve, reject) => {
        db.query('SELECT COUNT(*) as totalUsers FROM user WHERE RoleID = 2', (err, result) => {
          if (err) reject(err);
          else resolve(result[0].totalUsers);
        });
      }),
      new Promise((resolve, reject) => {
        db.query('SELECT COUNT(*) as totalModules FROM modules', (err, result) => {
          if (err) reject(err);
          else resolve(result[0].totalModules);
        });
      }),
      new Promise((resolve, reject) => {
        db.query('SELECT COUNT(*) as totalChapters FROM chapters', (err, result) => {
          if (err) reject(err);
          else resolve(result[0].totalChapters);
        });
      }),
      new Promise((resolve, reject) => {
        db.query('SELECT COUNT(*) as totalRewards FROM rewards', (err, result) => {
          if (err) reject(err);
          else resolve(result[0].totalRewards);
        });
      }),
      new Promise((resolve, reject) => {
        db.query('SELECT COUNT(*) as totalInsurancePlans FROM integratedshieldplan', (err, result) => {
          if (err) reject(err);
          else resolve(result[0].totalInsurancePlans);
        });
      }),
      new Promise((resolve, reject) => {
        db.query('SELECT COUNT(*) as totalRiders FROM rider', (err, result) => {
          if (err) reject(err);
          else resolve(result[0].totalRiders);
        });
      })
    ];

    const [totalUsers, totalModules, totalChapters, totalRewards, totalInsurancePlans, totalRiders] = await Promise.all(statsPromises);
    
    res.render('admin/dashboard', {
      user: getUserWithProfilePic(req.session.user),
      stats: {
        totalUsers,
        totalModules,
        totalChapters,
        totalRewards,
        totalInsurancePlans,
        totalRiders
      }
    });
    
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).render('error', {
      message: 'Error loading admin dashboard',
      user: getUserWithProfilePic(req.session.user)
    });
  }
};

// Module Management
exports.showModules = (req, res) => {
  const query = `
    SELECT m.*, 
           COUNT(c.ChapterID) as chapterCount
    FROM modules m
    LEFT JOIN chapters c ON m.ModuleID = c.ModuleID
    GROUP BY m.ModuleID
    ORDER BY m.CreatedAt DESC
  `;
  
  db.query(query, (err, modules) => {
    if (err) {
      console.error('Error fetching modules:', err);
      return res.status(500).render('error', {
        message: 'Error loading modules',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.render('admin/modules', {
      user: getUserWithProfilePic(req.session.user),
      modules: modules
    });
  });
};

exports.showCreateModule = (req, res) => {
  res.render('admin/create-module', {
    user: getUserWithProfilePic(req.session.user),
    error: null
  });
};

exports.createModule = (req, res) => {
  const { title, description, badge } = req.body;
  
  if (!title || !description) {
    return res.render('admin/create-module', {
      user: getUserWithProfilePic(req.session.user),
      error: 'Title and description are required'
    });
  }
  
  const query = 'INSERT INTO modules (Title, Description, Badge, CreatedAt) VALUES (?, ?, ?, NOW())';
  
  db.query(query, [title, description, badge || null], (err, result) => {
    if (err) {
      console.error('Error creating module:', err);
      return res.render('admin/create-module', {
        user: getUserWithProfilePic(req.session.user),
        error: 'Error creating module'
      });
    }
    
    res.redirect('/admin/modules');
  });
};

exports.showEditModule = (req, res) => {
  const moduleId = req.params.id;
  
  const query = 'SELECT * FROM modules WHERE ModuleID = ?';
  
  db.query(query, [moduleId], (err, results) => {
    if (err || results.length === 0) {
      console.error('Error fetching module:', err);
      return res.status(404).render('error', {
        message: 'Module not found',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.render('admin/edit-module', {
      user: getUserWithProfilePic(req.session.user),
      module: results[0],
      error: null
    });
  });
};

exports.updateModule = (req, res) => {
  const moduleId = req.params.id;
  const { title, description, badge } = req.body;
  
  if (!title || !description) {
    return db.query('SELECT * FROM modules WHERE ModuleID = ?', [moduleId], (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).render('error', {
          message: 'Module not found',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      res.render('admin/edit-module', {
        user: getUserWithProfilePic(req.session.user),
        module: results[0],
        error: 'Title and description are required'
      });
    });
  }
  
  const query = 'UPDATE modules SET Title = ?, Description = ?, Badge = ? WHERE ModuleID = ?';
  
  db.query(query, [title, description, badge || null, moduleId], (err, result) => {
    if (err) {
      console.error('Error updating module:', err);
      return db.query('SELECT * FROM modules WHERE ModuleID = ?', [moduleId], (err, results) => {
        if (err || results.length === 0) {
          return res.status(404).render('error', {
            message: 'Module not found',
            user: getUserWithProfilePic(req.session.user)
          });
        }
        
        res.render('admin/edit-module', {
          user: getUserWithProfilePic(req.session.user),
          module: results[0],
          error: 'Error updating module'
        });
      });
    }
    
    res.redirect('/admin/modules');
  });
};

exports.deleteModule = (req, res) => {
  const moduleId = req.params.id;
  
  // First delete related chapters
  const deleteChaptersQuery = 'DELETE FROM chapters WHERE ModuleID = ?';
  
  db.query(deleteChaptersQuery, [moduleId], (err) => {
    if (err) {
      console.error('Error deleting chapters:', err);
      return res.status(500).render('error', {
        message: 'Error deleting module',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    // Then delete the module
    const deleteModuleQuery = 'DELETE FROM modules WHERE ModuleID = ?';
    
    db.query(deleteModuleQuery, [moduleId], (err) => {
      if (err) {
        console.error('Error deleting module:', err);
        return res.status(500).render('error', {
          message: 'Error deleting module',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      res.redirect('/admin/modules');
    });
  });
};

// Chapter Management
exports.showModuleChapters = (req, res) => {
  const moduleId = req.params.id;
  
  const moduleQuery = 'SELECT * FROM modules WHERE ModuleID = ?';
  const chaptersQuery = 'SELECT * FROM chapters WHERE ModuleID = ? ORDER BY ChapterOrder ASC';
  
  db.query(moduleQuery, [moduleId], (err, moduleResults) => {
    if (err || moduleResults.length === 0) {
      console.error('Error fetching module:', err);
      return res.status(404).render('error', {
        message: 'Module not found',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    db.query(chaptersQuery, [moduleId], (err, chapters) => {
      if (err) {
        console.error('Error fetching chapters:', err);
        return res.status(500).render('error', {
          message: 'Error loading chapters',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      res.render('admin/module-chapters', {
        user: getUserWithProfilePic(req.session.user),
        module: moduleResults[0],
        chapters: chapters
      });
    });
  });
};

exports.showCreateChapter = (req, res) => {
  const moduleId = req.params.id;
  
  const query = 'SELECT * FROM modules WHERE ModuleID = ?';
  
  db.query(query, [moduleId], (err, results) => {
    if (err || results.length === 0) {
      console.error('Error fetching module:', err);
      return res.status(404).render('error', {
        message: 'Module not found',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.render('admin/create-chapter', {
      user: getUserWithProfilePic(req.session.user),
      module: results[0],
      error: null
    });
  });
};

exports.createChapter = (req, res) => {
  const moduleId = req.params.id;
  const { title, content, chapterOrder, tokenReward, quizQuestions } = req.body;
  
  if (!title || !content) {
    return db.query('SELECT * FROM modules WHERE ModuleID = ?', [moduleId], (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).render('error', {
          message: 'Module not found',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      res.render('admin/create-chapter', {
        user: getUserWithProfilePic(req.session.user),
        module: results[0],
        error: 'Title and content are required'
      });
    });
  }
  
  // Get next chapter order if not provided
  const orderQuery = 'SELECT COALESCE(MAX(ChapterOrder), 0) + 1 as nextOrder FROM chapters WHERE ModuleID = ?';
  
  db.query(orderQuery, [moduleId], (err, orderResults) => {
    if (err) {
      console.error('Error getting chapter order:', err);
      return res.status(500).render('error', {
        message: 'Error creating chapter',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    const order = chapterOrder || orderResults[0].nextOrder;
    const query = 'INSERT INTO chapters (ModuleID, Title, Content, ChapterOrder, TokenReward) VALUES (?, ?, ?, ?, ?)';
    
    db.query(query, [moduleId, title, content, order, tokenReward || 0], (err, result) => {
      if (err) {
        console.error('Error creating chapter:', err);
        return res.status(500).render('error', {
          message: 'Error creating chapter',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      const chapterId = result.insertId;
      
      // Handle quiz questions if provided
      if (quizQuestions && quizQuestions.trim() !== '' && quizQuestions !== '[]') {
        try {
          const questions = JSON.parse(quizQuestions);
          
          if (questions && questions.length > 0) {
            const insertQuizPromises = questions.map((q, index) => {
              return new Promise((resolve, reject) => {
                const quizQuery = 'INSERT INTO quiz (ModuleID, ChapterID, Question, Answer) VALUES (?, ?, ?, ?)';
                db.query(quizQuery, [moduleId, chapterId, q.question, q.answer], (err, result) => {
                  if (err) {
                    console.error('Error inserting quiz question:', err);
                    reject(err);
                  } else {
                    resolve(result);
                  }
                });
              });
            });
            
            Promise.all(insertQuizPromises)
              .then(() => {
                res.redirect(`/admin/modules/${moduleId}/chapters`);
              })
              .catch((err) => {
                console.error('Error inserting quiz questions:', err);
                res.redirect(`/admin/modules/${moduleId}/chapters`);
              });
          } else {
            res.redirect(`/admin/modules/${moduleId}/chapters`);
          }
        } catch (err) {
          console.error('Error parsing quiz questions:', err);
          res.redirect(`/admin/modules/${moduleId}/chapters`);
        }
      } else {
        res.redirect(`/admin/modules/${moduleId}/chapters`);
      }
    });
  });
};

exports.showEditChapter = (req, res) => {
  const moduleId = req.params.id;
  const chapterId = req.params.chapterId;
  
  const moduleQuery = 'SELECT * FROM modules WHERE ModuleID = ?';
  const chapterQuery = 'SELECT * FROM chapters WHERE ChapterID = ? AND ModuleID = ?';
  const quizQuery = 'SELECT * FROM quiz WHERE ModuleID = ? AND ChapterID = ? ORDER BY QuestionID';
  
  db.query(moduleQuery, [moduleId], (err, moduleResults) => {
    if (err || moduleResults.length === 0) {
      console.error('Error fetching module:', err);
      return res.status(404).render('error', {
        message: 'Module not found',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    db.query(chapterQuery, [chapterId, moduleId], (err, chapterResults) => {
      if (err || chapterResults.length === 0) {
        console.error('Error fetching chapter:', err);
        return res.status(404).render('error', {
          message: 'Chapter not found',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      // Get existing quiz questions for this chapter
      db.query(quizQuery, [moduleId, chapterId], (err, quizResults) => {
        if (err) {
          console.error('Error fetching quiz questions:', err);
          quizResults = []; // Continue with empty quiz array
        }
        
        console.log('Quiz query results for moduleId:', moduleId, 'chapterId:', chapterId, 'results:', quizResults);
        
        res.render('admin/edit-chapter', {
          user: getUserWithProfilePic(req.session.user),
          module: moduleResults[0],
          chapter: chapterResults[0],
          quizQuestions: quizResults,
          error: null
        });
      });
    });
  });
};

exports.updateChapter = (req, res) => {
  const moduleId = req.params.id;
  const chapterId = req.params.chapterId;
  const { title, content, chapterOrder, tokenReward, quizQuestions } = req.body;
  
  if (!title || !content) {
    return db.query('SELECT * FROM modules WHERE ModuleID = ?', [moduleId], (err, moduleResults) => {
      if (err || moduleResults.length === 0) {
        return res.status(404).render('error', {
          message: 'Module not found',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      db.query('SELECT * FROM chapters WHERE ChapterID = ? AND ModuleID = ?', [chapterId, moduleId], (err, chapterResults) => {
        if (err || chapterResults.length === 0) {
          return res.status(404).render('error', {
            message: 'Chapter not found',
            user: getUserWithProfilePic(req.session.user)
          });
        }
        
        // Get existing quiz questions for error page
        db.query('SELECT * FROM quiz WHERE ModuleID = ? AND ChapterID = ? ORDER BY QuestionID', [moduleId, chapterId], (err, quizResults) => {
          res.render('admin/edit-chapter', {
            user: getUserWithProfilePic(req.session.user),
            module: moduleResults[0],
            chapter: chapterResults[0],
            quizQuestions: quizResults || [],
            error: 'Title and content are required'
          });
        });
      });
    });
  }
  
  // First update the chapter
  const updateChapterQuery = 'UPDATE chapters SET Title = ?, Content = ?, ChapterOrder = ?, TokenReward = ? WHERE ChapterID = ? AND ModuleID = ?';
  
  db.query(updateChapterQuery, [title, content, chapterOrder || 1, tokenReward || 0, chapterId, moduleId], (err, result) => {
    if (err) {
      console.error('Error updating chapter:', err);
      return res.status(500).render('error', {
        message: 'Error updating chapter',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    // Handle quiz questions if provided
    if (quizQuestions) {
      let questions;
      try {
        questions = JSON.parse(quizQuestions);
      } catch (e) {
        console.error('Error parsing quiz questions:', e);
        return res.redirect(`/admin/modules/${moduleId}/chapters`);
      }
      
      // Delete existing quiz questions for this chapter
      const deleteQuizQuery = 'DELETE FROM quiz WHERE ModuleID = ? AND ChapterID = ?';
      
      db.query(deleteQuizQuery, [moduleId, chapterId], (err) => {
        if (err) {
          console.error('Error deleting existing quiz questions:', err);
          return res.redirect(`/admin/modules/${moduleId}/chapters`);
        }
        
        // Insert new quiz questions
        if (questions.length > 0) {
          const insertQuizQuery = 'INSERT INTO quiz (ModuleID, ChapterID, Question, Answer) VALUES ?';
          const questionValues = questions.map(q => [moduleId, chapterId, q.question, q.answer]);
          
          db.query(insertQuizQuery, [questionValues], (err) => {
            if (err) {
              console.error('Error inserting quiz questions:', err);
            }
            res.redirect(`/admin/modules/${moduleId}/chapters`);
          });
        } else {
          res.redirect(`/admin/modules/${moduleId}/chapters`);
        }
      });
    } else {
      res.redirect(`/admin/modules/${moduleId}/chapters`);
    }
  });
};

exports.deleteChapter = (req, res) => {
  const moduleId = req.params.id;
  const chapterId = req.params.chapterId;
  
  const query = 'DELETE FROM chapters WHERE ChapterID = ? AND ModuleID = ?';
  
  db.query(query, [chapterId, moduleId], (err, result) => {
    if (err) {
      console.error('Error deleting chapter:', err);
      return res.status(500).render('error', {
        message: 'Error deleting chapter',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.redirect(`/admin/modules/${moduleId}/chapters`);
  });
};

// Rewards Management
exports.showRewards = (req, res) => {
  const query = 'SELECT RewardID, RewardName, Description, TokenCost, QuantityAvailable, RewardImage, IsActive, CreatedAt FROM rewards ORDER BY TokenCost ASC';
  
  db.query(query, (err, rewards) => {
    if (err) {
      console.error('Error fetching rewards:', err);
      return res.status(500).render('error', {
        message: 'Error loading rewards',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.render('admin/rewards', {
      user: getUserWithProfilePic(req.session.user),
      rewards: rewards
    });
  });
};

exports.showCreateReward = (req, res) => {
  res.render('admin/create-reward', {
    user: getUserWithProfilePic(req.session.user),
    error: null,
    formData: {}
  });
};

exports.createReward = (req, res) => {
  const { name, description, cost, quantity } = req.body;
  const RewardImage = req.file ? req.file.filename : null;
  const formData = { name, description, cost, quantity };
  
  if (!name || !description || !cost) {
    return res.render('admin/create-reward', {
      user: getUserWithProfilePic(req.session.user),
      error: 'Reward name, description, and token cost are required',
      formData
    });
  }
  
  const query = 'INSERT INTO rewards (RewardName, Description, TokenCost, QuantityAvailable, RewardImage, IsActive, CreatedAt) VALUES (?, ?, ?, ?, ?, 1, NOW())';
  
  db.query(query, [name, description, parseInt(cost), quantity || 100, RewardImage], (err, result) => {
    if (err) {
      console.error('Error creating reward:', err);
      return res.render('admin/create-reward', {
        user: getUserWithProfilePic(req.session.user),
        error: 'Error creating reward',
        formData
      });
    }
    
    res.redirect('/admin/rewards');
  });
};

exports.showEditReward = (req, res) => {
  const rewardId = req.params.id;
  
  const query = 'SELECT * FROM rewards WHERE RewardID = ?';
  
  db.query(query, [rewardId], (err, results) => {
    if (err || results.length === 0) {
      console.error('Error fetching reward:', err);
      return res.status(404).render('error', {
        message: 'Reward not found',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.render('admin/edit-reward', {
      user: getUserWithProfilePic(req.session.user),
      reward: results[0],
      error: null
    });
  });
};

exports.updateReward = (req, res) => {
  const rewardId = req.params.id;
  const { name, description, cost, quantity, active } = req.body;
  const RewardImage = req.file ? req.file.filename : null;
  
  if (!name || !description || !cost) {
    return db.query('SELECT * FROM rewards WHERE RewardID = ?', [rewardId], (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).render('error', {
          message: 'Reward not found',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      res.render('admin/edit-reward', {
        user: getUserWithProfilePic(req.session.user),
        reward: results[0],
        error: 'Reward name, description, and token cost are required'
      });
    });
  }
  
  // Build the query based on whether an image was uploaded
  let query, params;
  if (RewardImage) {
    query = 'UPDATE rewards SET RewardName = ?, Description = ?, TokenCost = ?, QuantityAvailable = ?, RewardImage = ?, IsActive = ? WHERE RewardID = ?';
    params = [name, description, parseInt(cost), quantity || null, RewardImage, active ? 1 : 0, rewardId];
  } else {
    query = 'UPDATE rewards SET RewardName = ?, Description = ?, TokenCost = ?, QuantityAvailable = ?, IsActive = ? WHERE RewardID = ?';
    params = [name, description, parseInt(cost), quantity || null, active ? 1 : 0, rewardId];
  }
  
  db.query(query, params, (err, result) => {
    if (err) {
      console.error('Error updating reward:', err);
      return res.status(500).render('error', {
        message: 'Error updating reward',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.redirect('/admin/rewards');
  });
};

exports.deleteReward = (req, res) => {
  const rewardId = req.params.id;
  
  const query = 'DELETE FROM rewards WHERE RewardID = ?';
  
  db.query(query, [rewardId], (err, result) => {
    if (err) {
      console.error('Error deleting reward:', err);
      return res.status(500).render('error', {
        message: 'Error deleting reward',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.redirect('/admin/rewards');
  });
};

// Insurance Plans Management
exports.showInsurancePlans = (req, res) => {
  const query = `
    SELECT isp.IntegratedShieldPlanID, isp.ProviderName, isp.PremiumRange, 
           isp.EligibilityCriteria, isp.PlanName,
           isp.InsuranceCompanyID, isp.RiderID, isp.CoverageDetailsID,
           r.Name as RiderName,
           cd.WardType, cd.HospitalType, cd.OutOfPocketExpense,
           ic.InsuranceCompanyName
    FROM integratedshieldplan isp
    LEFT JOIN rider r ON isp.RiderID = r.RiderID
    LEFT JOIN coveragedetails cd ON isp.CoverageDetailsID = cd.CoverageDetailsID
    LEFT JOIN insurancecompany ic ON isp.InsuranceCompanyID = ic.InsuranceCompanyID
    ORDER BY isp.IntegratedShieldPlanID DESC
  `;
  
  db.query(query, (err, plans) => {
    if (err) {
      console.error('Error fetching insurance plans:', err);
      return res.status(500).render('error', {
        message: 'Error loading insurance plans',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.render('admin/insuranceplans', {
      user: getUserWithProfilePic(req.session.user),
      plans: plans
    });
  });
};

exports.showCreateInsurancePlan = (req, res) => {
  // Get insurance companies for dropdown
  const companiesQuery = 'SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID';
  const ridersQuery = 'SELECT * FROM rider ORDER BY Name';
  const coverageQuery = 'SELECT * FROM coveragedetails ORDER BY CoverageDetailsID';
  
  db.query(companiesQuery, (err, companies) => {
    if (err) {
      console.error('Error fetching insurance companies:', err);
      companies = [];
    }
    
    db.query(ridersQuery, (err, riders) => {
      if (err) {
        console.error('Error fetching riders:', err);
        riders = [];
      }
      
      db.query(coverageQuery, (err, coverageDetails) => {
        if (err) {
          console.error('Error fetching coverage details:', err);
          coverageDetails = [];
        }
        
        res.render('admin/create-insurance', {
          user: getUserWithProfilePic(req.session.user),
          companies: companies,
          riders: riders,
          coverageDetails: coverageDetails,
          error: null
        });
      });
    });
  });
};

exports.createInsurancePlan = (req, res) => {
  const { planName, providerName, premiumRange, eligibilityCriteria, insuranceCompanyId, riderId, coverageDetailsId, wardType, hospitalType, outOfPocketExpense } = req.body;
  
  if (!planName || !providerName || !premiumRange || !eligibilityCriteria) {
    return db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID', (err, companies) => {
      db.query('SELECT * FROM rider ORDER BY Name', (err2, riders) => {
        db.query('SELECT * FROM coveragedetails ORDER BY CoverageDetailsID', (err3, coverageDetailsList) => {
          res.render('admin/create-insurance', {
            user: getUserWithProfilePic(req.session.user),
            companies: companies || [],
            riders: riders || [],
            coverageDetails: coverageDetailsList || [],
            error: 'Plan name, provider name, premium range, and eligibility criteria are required'
          });
        });
      });
    });
  }
  
  // Handle coverage details creation or selection
  let finalCoverageDetailsId = coverageDetailsId;
  
  if (coverageDetailsId === 'new' && wardType && hospitalType && outOfPocketExpense) {
    // Create new coverage details first
    const createCoverageQuery = `
      INSERT INTO coveragedetails (WardType, HospitalType, OutOfPocketExpense) 
      VALUES (?, ?, ?)
    `;
    
    return db.query(createCoverageQuery, [wardType, hospitalType, outOfPocketExpense], (err, coverageResult) => {
      if (err) {
        console.error('Error creating coverage details:', err);
        return db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID', (err, companies) => {
          db.query('SELECT * FROM rider ORDER BY Name', (err2, riders) => {
            db.query('SELECT * FROM coveragedetails ORDER BY CoverageDetailsID', (err3, coverageDetailsList) => {
              res.render('admin/create-insurance', {
                user: getUserWithProfilePic(req.session.user),
                companies: companies || [],
                riders: riders || [],
                coverageDetails: coverageDetailsList || [],
                error: 'Error creating coverage details'
              });
            });
          });
        });
      }
      
      // Use the newly created coverage details ID
      finalCoverageDetailsId = coverageResult.insertId;
      
      // Now create the insurance plan
      const query = `
        INSERT INTO integratedshieldplan (PlanName, ProviderName, PremiumRange, EligibilityCriteria, InsuranceCompanyID, RiderID, CoverageDetailsID) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.query(query, [planName, providerName, premiumRange, eligibilityCriteria, insuranceCompanyId || null, riderId || null, finalCoverageDetailsId || null], (err, result) => {
        if (err) {
          console.error('Error creating insurance plan:', err);
          return db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID', (err, companies) => {
            db.query('SELECT * FROM rider ORDER BY Name', (err2, riders) => {
              db.query('SELECT * FROM coveragedetails ORDER BY CoverageDetailsID', (err3, coverageDetailsList) => {
                res.render('admin/create-insurance', {
                  user: getUserWithProfilePic(req.session.user),
                  companies: companies || [],
                  riders: riders || [],
                  coverageDetails: coverageDetailsList || [],
                  error: 'Error creating insurance plan'
                });
              });
            });
          });
        }
        
        res.redirect('/admin/insurance-plans');
      });
    });
  } else {
    // Use existing coverage details or no coverage details
    const query = `
      INSERT INTO integratedshieldplan (PlanName, ProviderName, PremiumRange, EligibilityCriteria, InsuranceCompanyID, RiderID, CoverageDetailsID) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(query, [planName, providerName, premiumRange, eligibilityCriteria, insuranceCompanyId || null, riderId || null, finalCoverageDetailsId || null], (err, result) => {
      if (err) {
        console.error('Error creating insurance plan:', err);
        return db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID', (err, companies) => {
          db.query('SELECT * FROM rider ORDER BY Name', (err2, riders) => {
            db.query('SELECT * FROM coveragedetails ORDER BY CoverageDetailsID', (err3, coverageDetailsList) => {
              res.render('admin/create-insurance', {
                user: getUserWithProfilePic(req.session.user),
                companies: companies || [],
                riders: riders || [],
                coverageDetails: coverageDetailsList || [],
                error: 'Error creating insurance plan'
              });
            });
          });
        });
      }
      
      res.redirect('/admin/insurance-plans');
    });
  }
};

exports.showEditInsurancePlan = (req, res) => {
  const planId = req.params.id;
  
  const planQuery = `
    SELECT isp.*, cd.WardType, cd.HospitalType, cd.OutOfPocketExpense 
    FROM integratedshieldplan isp
    LEFT JOIN coveragedetails cd ON isp.CoverageDetailsID = cd.CoverageDetailsID
    WHERE isp.IntegratedShieldPlanID = ?
  `;
  const companiesQuery = 'SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID';
  const ridersQuery = 'SELECT * FROM rider ORDER BY Name';
  const coverageQuery = 'SELECT * FROM coveragedetails ORDER BY CoverageDetailsID';
  
  db.query(planQuery, [planId], (err, planResults) => {
    if (err || planResults.length === 0) {
      console.error('Error fetching insurance plan:', err);
      return res.status(404).render('error', {
        message: 'Insurance plan not found',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    db.query(companiesQuery, (err, companies) => {
      if (err) {
        console.error('Error fetching insurance companies:', err);
        companies = [];
      }
      
      db.query(ridersQuery, (err, riders) => {
        if (err) {
          console.error('Error fetching riders:', err);
          riders = [];
        }
        
        db.query(coverageQuery, (err, coverageDetails) => {
          if (err) {
            console.error('Error fetching coverage details:', err);
            coverageDetails = [];
          }
          
          res.render('admin/edit-insurance', {
            user: getUserWithProfilePic(req.session.user),
            plan: planResults[0],
            companies: companies,
            riders: riders,
            coverageDetails: coverageDetails,
            error: null
          });
        });
      });
    });
  });
};

exports.updateInsurancePlan = (req, res) => {
    const planId = req.params.id;
    const { planName, providerName, premiumRange, eligibilityCriteria, insuranceCompanyId, riderId, coverageDetailsId, wardType, hospitalType, outOfPocketExpense } = req.body;
  
    if (!planName || !providerName || !premiumRange || !eligibilityCriteria) {
        return db.query('SELECT * FROM integratedshieldplan WHERE IntegratedShieldPlanID = ?', [planId], (err, planResults) => {
            if (err || planResults.length === 0) {
                return res.status(404).render('error', {
                    message: 'Insurance plan not found',
                    user: getUserWithProfilePic(req.session.user)
                });
            }
      
            db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID', (err, companies) => {
                db.query('SELECT * FROM rider ORDER BY Name', (err2, riders) => {
                    db.query('SELECT * FROM coveragedetails ORDER BY CoverageDetailsID', (err3, coverageDetailsList) => {
                        res.render('admin/edit-insurance', {
                            user: getUserWithProfilePic(req.session.user),
                            plan: planResults[0],
                            companies: companies || [],
                            riders: riders || [],
                            coverageDetails: coverageDetailsList || [],
                            error: 'All fields are required'
                        });
                    });
                });
            });
        });
    }

    // Handle coverage details creation if "new" is selected
    if (coverageDetailsId === 'new' && wardType && hospitalType && outOfPocketExpense) {
        const insertCoverageQuery = `
            INSERT INTO coveragedetails (WardType, HospitalType, OutOfPocketExpense)
            VALUES (?, ?, ?)
        `;
    
        db.query(insertCoverageQuery, [wardType, hospitalType, outOfPocketExpense], (err, coverageResult) => {
            if (err) {
                console.error('Error creating coverage details:', err);
                return db.query('SELECT * FROM integratedshieldplan WHERE IntegratedShieldPlanID = ?', [planId], (err, planResults) => {
                    if (err || planResults.length === 0) {
                        return res.status(404).render('error', {
                            message: 'Insurance plan not found',
                            user: getUserWithProfilePic(req.session.user)
                        });
                    }
          
                    db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID', (err, companies) => {
                        db.query('SELECT * FROM rider ORDER BY Name', (err2, riders) => {
                            db.query('SELECT * FROM coveragedetails ORDER BY CoverageDetailsID', (err3, coverageDetailsList) => {
                                res.render('admin/edit-insurance', {
                                    user: getUserWithProfilePic(req.session.user),
                                    plan: planResults[0],
                                    companies: companies || [],
                                    riders: riders || [],
                                    coverageDetails: coverageDetailsList || [],
                                    error: 'Error creating coverage details'
                                });
                            });
                        });
                    });
                });
            }
      
            const newCoverageDetailsId = coverageResult.insertId;
            updatePlan(newCoverageDetailsId);
        });
    } else {
        updatePlan(coverageDetailsId);
    }

    function updatePlan(finalCoverageDetailsId) {
        const query = `
            UPDATE integratedshieldplan 
            SET PlanName = ?, ProviderName = ?, PremiumRange = ?, EligibilityCriteria = ?, 
                InsuranceCompanyID = ?, RiderID = ?, CoverageDetailsID = ?
            WHERE IntegratedShieldPlanID = ?
        `;
    
        db.query(query, [
            planName, providerName, premiumRange, eligibilityCriteria,
            insuranceCompanyId || null, riderId || null, finalCoverageDetailsId || null, planId
        ], (err, result) => {
            if (err) {
                console.error('Error updating insurance plan:', err);
                return db.query('SELECT * FROM integratedshieldplan WHERE IntegratedShieldPlanID = ?', [planId], (err, planResults) => {
                    if (err || planResults.length === 0) {
                        return res.status(404).render('error', {
                            message: 'Insurance plan not found',
                            user: getUserWithProfilePic(req.session.user)
                        });
                    }
          
                    db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyID', (err, companies) => {
                        db.query('SELECT * FROM rider ORDER BY Name', (err2, riders) => {
                            db.query('SELECT * FROM coveragedetails ORDER BY CoverageDetailsID', (err3, coverageDetailsList) => {
                                res.render('admin/edit-insurance', {
                                    user: getUserWithProfilePic(req.session.user),
                                    plan: planResults[0],
                                    companies: companies || [],
                                    riders: riders || [],
                                    coverageDetails: coverageDetailsList || [],
                                    error: 'Error updating insurance plan'
                                });
                            });
                        });
                    });
                });
            }
      
            res.redirect('/admin/insurance-plans');
        });
    }
};

exports.deleteInsurancePlan = (req, res) => {
    const planId = req.params.id;
  
  // Delete the insurance plan (the RiderID will be set to NULL due to the relationship)
  const deletePlanQuery = 'DELETE FROM integratedshieldplan WHERE IntegratedShieldPlanID = ?';
  
    db.query(deletePlanQuery, [planId], (err) => {
        if (err) {
            console.error('Error deleting insurance plan:', err);
            return res.status(500).json({ error: 'Error deleting insurance plan' });
        }
    
    res.status(200).json({ success: true });
  });
};

// Riders Management
exports.showRiders = (req, res) => {
  const query = `
    SELECT r.RiderID, r.Name, r.Description, r.InsuranceCompanyID,
           ic.InsuranceCompanyName,
           COUNT(isp.IntegratedShieldPlanID) as planCount
    FROM rider r
    LEFT JOIN insurancecompany ic ON r.InsuranceCompanyID = ic.InsuranceCompanyID
    LEFT JOIN integratedshieldplan isp ON r.RiderID = isp.RiderID
    GROUP BY r.RiderID
    ORDER BY r.RiderID DESC
  `;
  
  db.query(query, (err, riders) => {
    if (err) {
      console.error('Error fetching riders:', err);
      return res.status(500).render('error', {
        message: 'Error loading riders',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    res.render('admin/riders', {
      user: getUserWithProfilePic(req.session.user),
      riders: riders
    });
  });
};

exports.showCreateRider = (req, res) => {
  // Get insurance companies for dropdown
  const companiesQuery = 'SELECT * FROM insurancecompany ORDER BY InsuranceCompanyName';
  
  db.query(companiesQuery, (err, companies) => {
    if (err) {
      console.error('Error fetching insurance companies:', err);
      companies = [];
    }
    
    res.render('admin/create-rider', {
      user: getUserWithProfilePic(req.session.user),
      companies: companies,
      error: null
    });
  });
};

exports.createRider = (req, res) => {
  const { name, description, insuranceCompanyId } = req.body;
  
  if (!name) {
    return db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyName', (err, companies) => {
      res.render('admin/create-rider', {
        user: getUserWithProfilePic(req.session.user),
        companies: companies || [],
        error: 'Rider name is required'
      });
    });
  }
  
  const query = `
    INSERT INTO rider (Name, Description, InsuranceCompanyID) 
    VALUES (?, ?, ?)
  `;
  
  db.query(query, [name, description || null, insuranceCompanyId || null], (err, result) => {
    if (err) {
      console.error('Error creating rider:', err);
      return db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyName', (err, companies) => {
        res.render('admin/create-rider', {
          user: getUserWithProfilePic(req.session.user),
          companies: companies || [],
          error: 'Error creating rider'
        });
      });
    }
    
    res.redirect('/admin/riders');
  });
};

exports.showEditRider = (req, res) => {
  const riderId = req.params.id;
  
  const riderQuery = 'SELECT * FROM rider WHERE RiderID = ?';
  const companiesQuery = 'SELECT * FROM insurancecompany ORDER BY InsuranceCompanyName';
  
  db.query(riderQuery, [riderId], (err, riderResults) => {
    if (err || riderResults.length === 0) {
      console.error('Error fetching rider:', err);
      return res.status(404).render('error', {
        message: 'Rider not found',
        user: getUserWithProfilePic(req.session.user)
      });
    }
    
    db.query(companiesQuery, (err, companies) => {
      if (err) {
        console.error('Error fetching insurance companies:', err);
        companies = [];
      }
      
      res.render('admin/edit-rider', {
        user: getUserWithProfilePic(req.session.user),
        rider: riderResults[0],
        companies: companies,
        error: null
      });
    });
  });
};

exports.updateRider = (req, res) => {
  const riderId = req.params.id;
  const { name, description, insuranceCompanyId } = req.body;
  
  if (!name) {
    return db.query('SELECT * FROM rider WHERE RiderID = ?', [riderId], (err, riderResults) => {
      if (err || riderResults.length === 0) {
        return res.status(404).render('error', {
          message: 'Rider not found',
          user: getUserWithProfilePic(req.session.user)
        });
      }
      
      db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyName', (err, companies) => {
        res.render('admin/edit-rider', {
          user: getUserWithProfilePic(req.session.user),
          rider: riderResults[0],
          companies: companies || [],
          error: 'Rider name is required'
        });
      });
    });
  }
  
  const query = `
    UPDATE rider 
    SET Name = ?, Description = ?, InsuranceCompanyID = ?
    WHERE RiderID = ?
  `;
  
  db.query(query, [name, description || null, insuranceCompanyId || null, riderId], (err, result) => {
    if (err) {
      console.error('Error updating rider:', err);
      return db.query('SELECT * FROM rider WHERE RiderID = ?', [riderId], (err, riderResults) => {
        if (err || riderResults.length === 0) {
          return res.status(404).render('error', {
            message: 'Rider not found',
            user: getUserWithProfilePic(req.session.user)
          });
        }
        
        db.query('SELECT * FROM insurancecompany ORDER BY InsuranceCompanyName', (err, companies) => {
          res.render('admin/edit-rider', {
            user: getUserWithProfilePic(req.session.user),
            rider: riderResults[0],
            companies: companies || [],
            error: 'Error updating rider'
          });
        });
      });
    }
    
    res.redirect('/admin/riders');
  });
};

exports.deleteRider = (req, res) => {
  const riderId = req.params.id;
  
  // First set any insurance plans using this rider to NULL
  const updatePlansQuery = 'UPDATE integratedshieldplan SET RiderID = NULL WHERE RiderID = ?';
  
  db.query(updatePlansQuery, [riderId], (err) => {
    if (err) {
      console.error('Error updating insurance plans:', err);
      return res.status(500).json({ error: 'Error deleting rider' });
    }
    
    // Then delete the rider
    const deleteRiderQuery = 'DELETE FROM rider WHERE RiderID = ?';
    
    db.query(deleteRiderQuery, [riderId], (err) => {
      if (err) {
        console.error('Error deleting rider:', err);
        return res.status(500).json({ error: 'Error deleting rider' });
      }
      
      res.status(200).json({ success: true });
    });
  });
};

exports.getUsers = (req, res) => {
    const searchQuery = req.query.search || '';
    let sql = 'SELECT UserID, UserName, Email, Contact, Address, Image, RoleID, CreationDate FROM user WHERE 1=1';
    let params = [];

    // Add search functionality
    if (searchQuery) {
        sql += ' AND (UserName LIKE ? OR Email LIKE ? OR Contact LIKE ?)';
        params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
    }

    // Order by role (admins first) and then by creation date
    sql += ' ORDER BY RoleID DESC, CreationDate DESC';

    // Fetch data from MySQL
    db.query(sql, params, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).render('error', {
                message: 'Error retrieving users',
                user: getUserWithProfilePic(req.session.user)
            });
        }

        // Render the admin/users page with results
        res.render('admin/users', { 
            user: getUserWithProfilePic(req.session.user),
            users: results,
            searchQuery: searchQuery
        });
    });
};

// Show form to add a new user
exports.addUserForm = (req, res) => {
    res.render('admin/create-user', { 
        user: getUserWithProfilePic(req.session.user),  // For navbar
        error: null,     // For error messages
        formData: null   // For form data persistence
    });
};

// Handle user creation
exports.addUser = async (req, res) => {
    try {
        const { UserName, Password, Email, Contact, RoleID, Address } = req.body;
        const Image = req.file ? req.file.filename : 'default-avatar.svg';
        
        // Hash the password
        const hashedPassword = await bcrypt.hash(Password, 10);
        
        // Insert the new user
        const result = await new Promise((resolve, reject) => {
            db.query(
                'INSERT INTO user (UserName, Password, Email, Contact, RoleID, Address, Image) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [UserName, hashedPassword, Email, Contact, RoleID || 2, Address, Image],
                (error, results) => {
                    if (error) reject(error);
                    else resolve(results);
                }
            );
        });

        if (result.affectedRows === 1) {
            req.flash('success', 'User created successfully');
            res.redirect('/admin/users');
        } else {
            throw new Error('Failed to create user');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        res.render('admin/create-user', {
            user: getUserWithProfilePic(req.session.user),
            error: error.message || 'Failed to create user',
            formData: req.body
        });
    }
};

exports.editUserForm = (req, res) => {
    const userId = req.params.id;
    const sql = 'SELECT * FROM user WHERE UserID = ?';

    db.query(sql, [userId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).render('error', {
                message: 'Error retrieving user',
                user: getUserWithProfilePic(req.session.user)
            });
        }

        // Check if any user with the given ID was found
        if (results.length > 0) {
            // Render HTML page with both the user data and session user
            res.render('admin/edit-user', { 
                userProfile: results[0],
                user: getUserWithProfilePic(req.session.user)
            });
        } else {
            // If no user with the given ID was found, render error page
            res.status(404).render('error', {
                message: 'User not found',
                user: getUserWithProfilePic(req.session.user)
            });
        }
    });
};

exports.editUser = (req, res) => {
    const userId = req.params.id;
    const {UserName, Email, Contact, Address, RoleID} = req.body;

    let image = req.body.currentImage; // Retrieve current image filename
    if (req.file) {
        image = req.file.filename; // Store just the filename, not full path
    }

    const sql = `
    UPDATE user SET 
    UserName = ?, Email = ?, Contact = ?, Address = ?, Image = ?, RoleID = ? 
    WHERE UserID = ?
    `;

    db.query(sql, [UserName, Email, Contact, Address, image, RoleID, userId], (err, result) => {
        if (err) {
            console.error('Error updating user:', err);
            return res.status(500).render('error', {
                message: 'Error updating user',
                user: getUserWithProfilePic(req.session.user)
            });
        }

        req.flash('success', 'User details updated successfully.');
        res.redirect('/admin/users');
    });
};

exports.deleteUser = (req, res) => {
    const userId = req.params.id;

    // Start a transaction to ensure data consistency
    db.beginTransaction((err) => {
        if (err) {
            console.error("Transaction start error:", err);
            return res.status(500).send('Error starting transaction');
        }

        // Function to rollback and send error
        const rollbackAndError = (error, message) => {
            console.error(message, error);
            db.rollback(() => {
                res.status(500).send(message);
            });
        };

        // Delete related data first (questionnaire responses, user tokens, etc.)
        const deleteQueries = [
            // Delete questionnaire responses (try both possible column names)
            "DELETE FROM questionnaire WHERE UserID = ? OR userid = ?",
            // Delete user tokens
            "DELETE FROM usertokens WHERE UserID = ?",
            // Delete user rewards
            "DELETE FROM userrewards WHERE UserID = ?",
            // Delete user module progress
            "DELETE FROM usermoduleprogress WHERE UserID = ?",
            // Delete user chapter progress
            "DELETE FROM userchapterprogress WHERE UserID = ?"
        ];

        let completed = 0;
        const totalQueries = deleteQueries.length;

        deleteQueries.forEach((query, index) => {
            const params = query.includes('OR userid') ? [userId, userId] : [userId];
            
            db.query(query, params, (error, results) => {
                if (error) {
                    // Log the error but don't fail the transaction for foreign key issues
                    console.log(`Non-critical deletion error for query ${index}:`, error.message);
                }
                
                completed++;
                
                if (completed === totalQueries) {
                    // Finally delete the user
                    db.query("DELETE FROM user WHERE UserID = ?", [userId], (error, results) => {
                        if (error) {
                            return rollbackAndError(error, 'Error deleting user');
                        }

                        // Commit the transaction
                        db.commit((err) => {
                            if (err) {
                                return rollbackAndError(err, 'Error committing transaction');
                            }
                            
                            console.log(`User ${userId} deleted successfully`);
                            res.redirect('/admin/users');
                        });
                    });
                }
            });
        });
    });
};
