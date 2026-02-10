const mysql = require('mysql2/promise');

class Database {
  constructor() {
    this.pool = null;
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      database: process.env.DB_NAME || 'webhook_db',
      user: process.env.DB_USER || 'webhook_user',
      password: process.env.DB_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 20, // Increased from 10 to 20 for burst traffic
      queueLimit: 10, // Max 10 waiting connections (was 0 = unlimited)
      connectTimeout: 10000, // 10 second connection timeout
      charset: 'utf8mb4',
      timezone: '+00:00'
    };
  }

  async initialize() {
    try {
      this.pool = mysql.createPool(this.config);

      // Test the connection with retry logic
      let retries = 5;
      while (retries > 0) {
        try {
          const connection = await this.pool.getConnection();
          console.log(`✅ Database connected (${this.config.host}:${this.config.port}/${this.config.database})`);
          connection.release();
          return this.pool;
        } catch (error) {
          retries--;
          if (retries > 0) {
            console.log(`⚠️  Database connection retry (${retries} left)...`);
            // Wait 2 seconds before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.error(`❌ Database connection failed: ${error.message}`);
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Database connection failed after all retries:', error.message);
      throw error;
    }
  }

  async query(sql, params = [], timeoutMs = 30000) {
    if (!this.pool) {
      await this.initialize();
    }

    // Implement query timeout protection
    let timeoutId;
    const queryPromise = this.pool.execute(sql, params);
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Query timeout after ${timeoutMs}ms: ${sql.substring(0, 100)}...`));
      }, timeoutMs);
    });

    try {
      const [rows] = await Promise.race([queryPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      return rows;
    } catch (error) {
      clearTimeout(timeoutId);
      // Log slow query warnings
      if (error.message.includes('Query timeout')) {
        console.error('[SECURITY] Slow query detected:', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      } else {
        console.error('Database query error:', error.message);
      }
      throw error;
    }
  }

  async transaction(callback) {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection closed');
    }
  }

  // Health check method
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.length > 0;
    } catch (_error) {
      return false;
    }
  }
}

// Create singleton instance
const database = new Database();

// Initialize on module load
database.initialize().catch(error => {
  console.error('Failed to initialize database:', error.message);
});

module.exports = database;