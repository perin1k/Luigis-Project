// Disposable OPS-05 test child only; never started by the application server.
import {openDatabase} from '../../src/data/database.js';
if(process.env.LUIGIS_DISPOSABLE_RECREATION!=='1'||typeof process.send!=='function')throw new Error('Isolated recreation test child required.');
const objDatabase=openDatabase(process.env.DATABASE_PATH);
objDatabase.exec('BEGIN IMMEDIATE');
objDatabase.prepare('INSERT INTO catalog_versions (id,revision) VALUES (?,?)').run('uncommitted-recreation-fixture',999);
objDatabase.prepare("UPDATE ingredients SET is_available=1 WHERE code='onion'").run();
process.send('uncommitted-write-ready');
setInterval(()=>{},1000);
