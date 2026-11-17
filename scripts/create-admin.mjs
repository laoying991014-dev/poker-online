import 'dotenv/config';
import postgres from 'postgres';
import { createHash } from 'node:crypto';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('缺少 DATABASE_URL，请先在 .env 中配置');
  process.exit(1);
}

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'admin123';
const coins = Number(process.env.ADMIN_INITIAL_COINS || 0);
const passwordHash = createHash('sha256')
  .update('poker-salt' + password)
  .digest('hex');

const sql = postgres(url, {
  prepare: false,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require',
});

try {
  await sql`
    INSERT INTO poker_users (username, password_hash, nickname, coins, is_admin)
    VALUES (${username}, ${passwordHash}, ${'管理员'}, ${coins}, true)
    ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          is_admin = true
  `;
  console.log(`管理员账号已就绪：${username}`);
  console.log('如果这是生产环境，请立刻在后台或环境变量中修改默认密码。');
} finally {
  await sql.end();
}
