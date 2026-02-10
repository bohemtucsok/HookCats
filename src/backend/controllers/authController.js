const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const database = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');

/**
 * Validation rules for login
 */
const loginValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores and hyphens'),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

/**
 * Login endpoint
 * POST /api/login
 */
const login = asyncHandler(async (req, res) => {
  // Check validation results
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { username, password } = req.body;

  try {
    // Account lockout settings
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

    // Find user in database with role information AND lockout data
    const users = await database.query(
      'SELECT id, username, password_hash, role, is_active, login_attempts, locked_until, created_at FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: req.t('auth.invalid_credentials')
      });
    }

    const user = users[0];

    // Check if user is active
    if (user.is_active === false) {
      return res.status(401).json({
        success: false,
        error: req.t('auth.account_inactive')
      });
    }

    // SECURITY: Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        success: false,
        error: req.t('auth.account_locked', { minutes: remainingMinutes }),
        locked: true,
        remainingMinutes
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // SECURITY: Increase failed login attempts
      const newAttempts = (user.login_attempts || 0) + 1;

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        // Lock account for 30 minutes
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);

        await database.query(
          'UPDATE users SET login_attempts = ?, locked_until = ? WHERE id = ?',
          [newAttempts, lockedUntil, user.id]
        );

        console.warn(`[SECURITY] Account locked due to ${newAttempts} failed attempts: ${username}`);

        return res.status(423).json({
          success: false,
          error: req.t('auth.too_many_attempts'),
          locked: true,
          remainingMinutes: 30
        });
      } else {
        // Just increment attempts
        await database.query(
          'UPDATE users SET login_attempts = ? WHERE id = ?',
          [newAttempts, user.id]
        );

        const remainingAttempts = MAX_LOGIN_ATTEMPTS - newAttempts;

        return res.status(401).json({
          success: false,
          error: req.t('auth.invalid_password_remaining', { remaining: remainingAttempts }),
          remainingAttempts
        });
      }
    }

    // SECURITY: Successful login - reset attempts and unlock
    await database.query(
      'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Generate JWT token with session fingerprint
    const token = generateToken(user, req);

    console.log(`[AUTH] Successful login: ${username} (role: ${user.role})`);

    // Return success response with token and role information
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role || 'user',
          is_active: user.is_active,
          created_at: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    throw new CustomError('Authentication service error', 500);
  }
});

/**
 * Get current user info (requires authentication)
 * GET /api/me
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  // User info is already available in req.user from auth middleware
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
});

/**
 * Validation rules for user creation (for testing/setup purposes)
 */
const createUserValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores and hyphens'),

  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>_\-+=]/)
    .withMessage('Password must contain at least one special character (!@#$%^&*(),.?":{}|<>_-+=)')
];

/**
 * Create new user (for initial setup or testing)
 * POST /api/users
 */
const createUser = asyncHandler(async (req, res) => {
  // Check validation results
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { username, password } = req.body;

  try {
    // Check if user already exists
    const existingUsers = await database.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await database.query(
      'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, NOW())',
      [username, passwordHash]
    );

    // Get created user
    const createdUsers = await database.query(
      'SELECT id, username, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    const user = createdUsers[0];

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('User creation error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      throw new CustomError('Username already exists', 409);
    }

    throw new CustomError('User creation failed', 500);
  }
});

/**
 * Get all users (admin only)
 * GET /api/users
 */
const getUsers = asyncHandler(async (req, res) => {
  try {
    const users = await database.query(
      'SELECT id, username, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    throw new CustomError('Failed to fetch users', 500);
  }
});

/**
 * Delete user
 * DELETE /api/users/:id
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user.id;

  // Prevent users from deleting themselves
  if (parseInt(id) === currentUserId) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete your own account'
    });
  }

  try {
    // Check if user exists
    const users = await database.query(
      'SELECT id, username FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Delete user (cascading will handle related data)
    await database.query('DELETE FROM users WHERE id = ?', [id]);

    res.json({
      success: true,
      data: {
        message: 'User deleted successfully',
        deletedUser: users[0]
      }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    throw new CustomError('Failed to delete user', 500);
  }
});

/**
 * Validation rules for username change
 */
const changeUsernameValidation = [
  body('newUsername')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores and hyphens')
];

/**
 * Change username
 * PUT /api/profile/username
 */
const changeUsername = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { newUsername } = req.body;
  const userId = req.user.id;

  try {
    // Check if new username already exists
    const existingUsers = await database.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [newUsername, userId]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Update username
    await database.query(
      'UPDATE users SET username = ? WHERE id = ?',
      [newUsername, userId]
    );

    // Get updated user info
    const updatedUsers = await database.query(
      'SELECT id, username, created_at FROM users WHERE id = ?',
      [userId]
    );

    const user = updatedUsers[0];

    res.json({
      success: true,
      data: {
        message: 'Username updated successfully',
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at
        }
      }
    });
  } catch (error) {
    console.error('Change username error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      throw new CustomError('Username already exists', 409);
    }

    throw new CustomError('Failed to update username', 500);
  }
});

/**
 * Validation rules for password change
 */
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),

  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('New password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('New password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('New password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>_\-+=]/)
    .withMessage('New password must contain at least one special character (!@#$%^&*(),.?":{}|<>_-+=)'),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    })
];

/**
 * Change password
 * PUT /api/profile/password
 */
const changePassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    // Get current user with password hash
    const users = await database.query(
      'SELECT id, username, password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await database.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, userId]
    );

    res.json({
      success: true,
      data: {
        message: 'Password updated successfully'
      }
    });
  } catch (error) {
    console.error('Change password error:', error);
    throw new CustomError('Failed to update password', 500);
  }
});

/**
 * Get user profile
 * GET /api/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const users = await database.query(
      'SELECT id, username, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    throw new CustomError('Failed to fetch profile', 500);
  }
});

/**
 * Find or create SSO user
 * @param {Object} userInfo - SSO provider user info
 * @param {string} ssoProvider - SSO provider name (authentik, keycloak, etc.)
 * @param {Object} req - Express request object (for session fingerprinting)
 */
const findOrCreateSSOUser = async (userInfo, ssoProvider, req) => {
  try {
    // Determine username based on provider
    let username = userInfo.preferred_username || userInfo.email || userInfo.sub;
    let email = userInfo.email || '';

    // Azure AD specific handling
    if (ssoProvider.toLowerCase() === 'azure') {
      username = userInfo.userPrincipalName || userInfo.mail || userInfo.id;
      email = userInfo.mail || userInfo.userPrincipalName || '';
    }

    // Google specific handling
    if (ssoProvider.toLowerCase() === 'google') {
      username = userInfo.email;
      email = userInfo.email;
    }

    if (!username) {
      console.error('No username found in SSO user info:', userInfo);
      return null;
    }

    // Sanitize and normalize
    username = username.toLowerCase().trim();

    // Search by username or email
    const users = await database.query(
      'SELECT id, username, email, role, sso_provider, sso_subject FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    let user;

    if (users.length > 0) {
      // Existing user
      user = users[0];

      // Update SSO information and last_login
      if (!user.sso_provider || !user.sso_subject) {
        await database.query(
          'UPDATE users SET sso_provider = ?, sso_subject = ?, email = ?, last_login = NOW(), updated_at = NOW() WHERE id = ?',
          [ssoProvider, userInfo.sub || userInfo.id, email, user.id]
        );
      } else {
        // Only update last_login
        await database.query(
          'UPDATE users SET last_login = NOW() WHERE id = ?',
          [user.id]
        );
      }

      // Re-query user data (to ensure role is up-to-date)
      const refreshedUsers = await database.query(
        'SELECT id, username, email, role, sso_provider, sso_subject FROM users WHERE id = ?',
        [user.id]
      );
      user = refreshedUsers[0];
    } else {
      // Create new user
      console.log('Creating new SSO user:', { username, email, ssoProvider });

      // Check if this is the first user (first SSO user = admin)
      const usersCount = await database.query('SELECT COUNT(*) as count FROM users');
      const isFirstUser = usersCount[0].count === 0;
      const userRole = isFirstUser ? 'admin' : 'user';

      console.log('SSO user role:', userRole, '(first user:', isFirstUser, ')');

      // Check if the users table supports SSO fields
      try {
        const result = await database.query(
          'INSERT INTO users (username, email, password_hash, role, sso_provider, sso_subject, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [username, email, '', userRole, ssoProvider, userInfo.sub || userInfo.id]
        );

        user = {
          id: result.insertId,
          username: username,
          email: email,
          role: userRole,
          sso_provider: ssoProvider,
          sso_subject: userInfo.sub || userInfo.id
        };
      } catch (dbError) {
        // If SSO fields do not exist, try creating user without them
        if (dbError.code === 'ER_BAD_FIELD_ERROR') {
          console.log('SSO columns not available, creating user without SSO fields');
          const result = await database.query(
            'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, NOW())',
            [username, '']
          );

          user = {
            id: result.insertId,
            username: username,
            email: email
          };
        } else {
          throw dbError;
        }
      }
    }

    // Generate JWT token with session fingerprint
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role || 'user'
    }, req);

    console.log('SSO user login successful:', {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      provider: ssoProvider
    });

    return token;

  } catch (error) {
    console.error('Error in findOrCreateSSOUser:', error);
    return null;
  }
};

/**
 * RBAC - User Management Functions
 * Only admin users can use these
 */

/**
 * Validation rules for user role update
 */
const updateUserRoleValidation = [
  body('role')
    .isIn(['admin', 'user'])
    .withMessage('Role must be either admin or user')
];

/**
 * Update user role (admin only)
 * PUT /api/admin/users/:id/role
 */
const updateUserRole = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { role } = req.body;
  const currentUserId = req.user.id;

  // Prevent users from changing their own role
  if (parseInt(id) === currentUserId) {
    return res.status(400).json({
      success: false,
      error: req.t('users.cannot_modify_own_role')
    });
  }

  try {
    // Check if target user exists
    const users = await database.query(
      'SELECT id, username, role FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: req.t('users.not_found')
      });
    }

    const targetUser = users[0];

    // If demoting from admin, check if there would be at least one admin left
    if (targetUser.role === 'admin' && role !== 'admin') {
      const adminCount = await database.query(
        'SELECT COUNT(*) as count FROM users WHERE role = ?',
        ['admin']
      );

      if (adminCount[0].count <= 1) {
        return res.status(400).json({
          success: false,
          error: req.t('users.last_admin_role')
        });
      }
    }

    // Set audit context for trigger
    await database.query('SET @audit_user_id = ?', [currentUserId]);

    // Update user role
    await database.query(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, id]
    );

    // Get updated user info
    const updatedUsers = await database.query(
      'SELECT id, username, role, is_active, created_at FROM users WHERE id = ?',
      [id]
    );

    const updatedUser = updatedUsers[0];

    res.json({
      success: true,
      data: {
        message: req.t('users.role_updated'),
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          role: updatedUser.role,
          is_active: updatedUser.is_active,
          created_at: updatedUser.created_at
        }
      }
    });
  } catch (error) {
    console.error('User role update error:', error);
    throw new CustomError(req.t('users.role_update_failed'), 500);
  }
});

/**
 * Set user active status (admin only)
 * PUT /api/admin/users/:id/active
 */
const setUserActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const currentUserId = req.user.id;

  // Validate is_active
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'is_active must be a boolean value'
    });
  }

  // Prevent users from deactivating themselves
  if (parseInt(id) === currentUserId) {
    return res.status(400).json({
      success: false,
      error: req.t('users.cannot_deactivate_self')
    });
  }

  try {
    // Check if target user exists
    const users = await database.query(
      'SELECT id, username, role, is_active FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: req.t('users.not_found')
      });
    }

    const targetUser = users[0];

    // If deactivating an admin, check if there would be at least one active admin left
    if (targetUser.role === 'admin' && !is_active) {
      const activeAdminCount = await database.query(
        'SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = ?',
        ['admin', true]
      );

      if (activeAdminCount[0].count <= 1) {
        return res.status(400).json({
          success: false,
          error: req.t('users.last_admin_active')
        });
      }
    }

    // Update user active status
    await database.query(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [is_active, id]
    );

    // Get updated user info
    const updatedUsers = await database.query(
      'SELECT id, username, role, is_active, created_at FROM users WHERE id = ?',
      [id]
    );

    const updatedUser = updatedUsers[0];

    res.json({
      success: true,
      data: {
        message: is_active ? req.t('users.activated') : req.t('users.deactivated'),
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          role: updatedUser.role,
          is_active: updatedUser.is_active,
          created_at: updatedUser.created_at
        }
      }
    });
  } catch (error) {
    console.error('User active status update error:', error);
    throw new CustomError(req.t('users.status_update_failed'), 500);
  }
});

/**
 * Get all users with role information (admin only)
 * GET /api/admin/users
 */
const getAllUsersWithRoles = asyncHandler(async (req, res) => {
  try {
    const users = await database.query(
      'SELECT id, username, role, is_active, email, full_name, sso_provider, last_login, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    throw new CustomError(req.t('users.fetch_failed'), 500);
  }
});

/**
 * Delete user with safety checks (admin only)
 * DELETE /api/admin/users/:id
 */
const deleteUserSafe = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user.id;

  // Prevent users from deleting themselves
  if (parseInt(id) === currentUserId) {
    return res.status(400).json({
      success: false,
      error: req.t('users.cannot_delete_self')
    });
  }

  try {
    // Check if user exists
    const users = await database.query(
      'SELECT id, username, role FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: req.t('users.not_found')
      });
    }

    const targetUser = users[0];

    // If deleting an admin, check if there would be at least one admin left
    if (targetUser.role === 'admin') {
      const adminCount = await database.query(
        'SELECT COUNT(*) as count FROM users WHERE role = ?',
        ['admin']
      );

      if (adminCount[0].count <= 1) {
        return res.status(400).json({
          success: false,
          error: req.t('users.last_admin_role')
        });
      }
    }

    // Delete user (cascading will handle related data)
    await database.query('DELETE FROM users WHERE id = ?', [id]);

    res.json({
      success: true,
      data: {
        message: req.t('users.deleted'),
        deletedUser: targetUser
      }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    throw new CustomError(req.t('users.delete_failed'), 500);
  }
});

/**
 * Change user preferred language
 * PUT /api/profile/language
 */
const changeLanguage = asyncHandler(async (req, res) => {
  const { language } = req.body;
  const SUPPORTED_LANGS = ['en', 'hu'];

  if (!language || !SUPPORTED_LANGS.includes(language)) {
    return res.status(400).json({
      success: false,
      error: req.t ? req.t('validation.invalid_language') : 'Invalid language'
    });
  }

  await database.query(
    'UPDATE users SET preferred_language = ? WHERE id = ?',
    [language, req.user.id]
  );

  res.json({ success: true, data: { language } });
});

module.exports = {
  login,
  getCurrentUser,
  createUser,
  getUsers,
  deleteUser,
  changeUsername,
  changePassword,
  changeLanguage,
  getProfile,
  findOrCreateSSOUser,
  // RBAC user management functions
  updateUserRole,
  setUserActive,
  getAllUsersWithRoles,
  deleteUserSafe,
  // Validation rules
  loginValidation,
  createUserValidation,
  changeUsernameValidation,
  changePasswordValidation,
  updateUserRoleValidation
};