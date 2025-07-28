const db = require('../db');

// Get insurance plans comparison page
exports.getInsurancePlansComparison = async (req, res) => {
    try {
        let user = req.session.user || null;
        
        // If user is logged in, get their current token balance
        if (user) {
            const userTokenQuery = `
                SELECT u.UserID, u.UserName, u.Email, u.RoleID, ut.TokenBalance, u.Image
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
                    profilePicUrl: (() => {
                        if (!userResult.Image || userResult.Image === 'default-avatar.svg') {
                            return '/images/default-avatar.svg';
                        }
                        // Handle both full paths and filenames
                        if (userResult.Image.startsWith('/images/')) {
                            return userResult.Image;
                        }
                        return '/images/users/' + userResult.Image;
                    })()
                };
            }
        }

        // Check if specific plans are requested for comparison
        const selectedPlanIds = req.query.plans ? req.query.plans.split(',') : [];
        let comparisonPlans = [];
        let showComparison = false;

        // Debug: Let's also try a simpler query to test basic connectivity
        const testQuery = 'SELECT COUNT(*) as count FROM integratedshieldplan';
        const testResult = await new Promise((resolve, reject) => {
            db.query(testQuery, (err, results) => {
                if (err) {
                    console.error('Error with test query:', err);
                    reject(err);
                } else {
                    console.log('Test query result - Total plans in DB:', results[0].count);
                    resolve(results);
                }
            });
        });

        // Fetch insurance plans from the database
        const plansQuery = `
            SELECT isp.IntegratedShieldPlanID, isp.ProviderName, isp.PremiumRange, 
                   isp.EligibilityCriteria, isp.PlanName,
                   cd.WardType, cd.HospitalType, cd.OutOfPocketExpense,
                   r.Name as RiderName
            FROM integratedshieldplan isp
            LEFT JOIN coveragedetails cd ON isp.CoverageDetailsID = cd.CoverageDetailsID
            LEFT JOIN rider r ON isp.RiderID = r.RiderID
            ORDER BY isp.IntegratedShieldPlanID
        `;

        const plans = await new Promise((resolve, reject) => {
            db.query(plansQuery, (err, results) => {
                if (err) {
                    console.error('Error fetching plans:', err);
                    reject(err);
                } else {
                    console.log('Plans fetched from database:', results.length, 'plans found');
                    console.log('Sample plan data:', results[0]);
                    resolve(results);
                }
            });
        });

        // If specific plans are selected for comparison, fetch their details
        if (selectedPlanIds.length >= 2) {
            const placeholders = selectedPlanIds.map(() => '?').join(',');
            const comparisonQuery = `
                SELECT isp.IntegratedShieldPlanID, isp.ProviderName, isp.PremiumRange, 
                       isp.EligibilityCriteria, isp.PlanName,
                       cd.WardType, cd.HospitalType, cd.OutOfPocketExpense,
                       r.Name as RiderName
                FROM integratedshieldplan isp
                LEFT JOIN coveragedetails cd ON isp.CoverageDetailsID = cd.CoverageDetailsID
                LEFT JOIN rider r ON isp.RiderID = r.RiderID
                WHERE isp.IntegratedShieldPlanID IN (${placeholders})
                ORDER BY isp.IntegratedShieldPlanID
            `;

            comparisonPlans = await new Promise((resolve, reject) => {
                db.query(comparisonQuery, selectedPlanIds, (err, results) => {
                    if (err) {
                        console.error('Error fetching comparison plans:', err);
                        reject(err);
                    } else {
                        console.log('Comparison plans fetched:', results.length, 'plans found');
                        console.log('Comparison plan data:', results);
                        resolve(results);
                    }
                });
            });
            showComparison = true;
        }

        console.log('Rendering AIComparison with:', {
            plansCount: plans.length,
            comparisonPlansCount: comparisonPlans.length,
            showComparison: showComparison,
            selectedPlanIds: selectedPlanIds
        });

        res.render('AIComparison', {
            title: 'Compare Insurance Plans',
            messages: req.flash('success'),
            errors: req.flash('error'),
            session: req.session,
            user: user,
            plans: plans,
            comparisonPlans: comparisonPlans,
            showComparison: showComparison,
            selectedPlanIds: selectedPlanIds
        });
    } catch (error) {
        console.error('Error fetching insurance plans:', error);
        res.render('AIComparison', {
            title: 'Compare Insurance Plans',
            messages: req.flash('error'),
            errors: ['Error loading insurance plans'],
            session: req.session,
            user: req.session.user || null,
            plans: [],
            comparisonPlans: [],
            showComparison: false,
            selectedPlanIds: []
        });
    }
};



exports.getAIChat = (req, res) => {
    // Render AI chat page with user session data
    res.render('AI', {
        title: 'AI Health Insurance Assistant',
        messages: req.flash('success'),
        errors: req.flash('error'),
        session: req.session,
        user: req.session.user || null
    });
};


