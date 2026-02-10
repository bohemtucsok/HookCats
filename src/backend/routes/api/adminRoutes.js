const express = require('express');
const router = express.Router();

const { requireAdmin, auditLog } = require('../../middleware/rbac');
const authController = require('../../controllers/authController');
const { param } = require('express-validator');

/**
 * Admin user management routes
 */
router.get('/admin/users', requireAdmin(), auditLog('view_users', 'users'), authController.getAllUsersWithRoles);

router.put('/admin/users/:id/role', [
  requireAdmin(),
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  ...authController.updateUserRoleValidation,
  auditLog('update_user_role', 'users')
], authController.updateUserRole);

router.put('/admin/users/:id/active', [
  requireAdmin(),
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  auditLog('update_user_status', 'users')
], authController.setUserActive);

router.delete('/admin/users/:id', [
  requireAdmin(),
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  auditLog('delete_user', 'users')
], authController.deleteUserSafe);

// Legacy user routes
router.get('/users', requireAdmin(), authController.getUsers);

router.delete('/users/:id', [
  requireAdmin(),
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  auditLog('delete_user_legacy', 'users')
], authController.deleteUser);

/**
 * Migration endpoint for team tables (admin only)
 */
router.post('/create-team-tables', requireAdmin(), async (req, res) => {
  try {
    const database = require('../../config/database');
    console.log('Team tables letrehozas inditasa...');

    await database.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_by_user_id INT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_teams_active (is_active),
        INDEX idx_teams_created_by (created_by_user_id),
        INDEX idx_teams_name (name)
      )
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id INT PRIMARY KEY AUTO_INCREMENT,
        team_id INT NOT NULL,
        user_id INT NOT NULL,
        role ENUM('owner', 'admin', 'member') DEFAULT 'member',
        is_active BOOLEAN DEFAULT TRUE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_team_user (team_id, user_id),
        INDEX idx_team_members_team (team_id),
        INDEX idx_team_members_user (user_id),
        INDEX idx_team_members_role (role),
        INDEX idx_team_members_active (is_active)
      )
    `);

    const tables = ['sources', 'targets', 'routes', 'events', 'deliveries'];
    for (const table of tables) {
      try {
        await database.query(`
          ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS visibility ENUM('personal', 'team') DEFAULT 'personal',
          ADD COLUMN IF NOT EXISTS team_id INT NULL,
          ADD COLUMN IF NOT EXISTS shared_at TIMESTAMP NULL
        `);
      } catch (alterError) {
        console.log(`${table} tabla mar frissitve vagy hiba: ${alterError.message}`);
      }
    }

    try {
      await database.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS default_team_id INT NULL,
        ADD COLUMN IF NOT EXISTS team_preferences JSON NULL
      `);
    } catch (alterError) {
      console.log(`Users tabla mar frissitve vagy hiba: ${alterError.message}`);
    }

    try {
      const [adminUser] = await database.query(
        'SELECT id FROM users WHERE role = ? AND username = ? LIMIT 1',
        ['admin', 'admin']
      );
      if (adminUser.length > 0) {
        const [existingTeam] = await database.query(
          'SELECT id FROM teams WHERE name = ? LIMIT 1',
          ['Alapertelmezett Csapat']
        );
        if (existingTeam.length === 0) {
          const [teamResult] = await database.query(
            'INSERT INTO teams (name, description, created_by_user_id, created_at) VALUES (?, ?, ?, NOW())',
            ['Alapertelmezett Csapat', 'Automatikusan letrehozott alapertelmezett team az admin felhasznalok szamara', adminUser[0].id]
          );
          const teamId = teamResult.insertId;
          await database.query(
            "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', NOW())",
            [teamId, adminUser[0].id]
          );
          await database.query('UPDATE users SET default_team_id = ? WHERE id = ?', [teamId, adminUser[0].id]);
        }
      }
    } catch (teamError) {
      console.log(`Alapertelmezett team letrehozasi hiba: ${teamError.message}`);
    }

    const [teamsCount] = await database.query('SELECT COUNT(*) as count FROM teams');
    const [membersCount] = await database.query('SELECT COUNT(*) as count FROM team_members');

    res.json({
      success: true,
      message: 'Team management tablak sikeresen letrehozva',
      data: {
        teams_count: teamsCount[0].count,
        team_members_count: membersCount[0].count,
        tables_created: ['teams', 'team_members'],
        tables_updated: ['sources', 'targets', 'routes', 'events', 'deliveries', 'users']
      }
    });
  } catch (error) {
    console.error('Team tables letrehozasi hiba:', error);
    res.status(500).json({ success: false, error: 'Database migration failed', details: error.message });
  }
});

module.exports = router;
