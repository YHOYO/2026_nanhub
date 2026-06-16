import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.resolve(__dirname, '../database/nanproxy.db'));

// Delete all remote images
const count = db.prepare("DELETE FROM image_generations WHERE source = 'remote'").run();
console.log(`Deleted ${count.changes} remote images from DB`);

db.close();
console.log('Done. Now run: curl -X POST http://localhost:8080/api/nancloud/images/sync -H "Content-Type: application/json" -d "{ \"limit\": 50, \"offset\": 0 }"');
