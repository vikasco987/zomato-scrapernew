import axios from 'axios';
import fs from 'fs';
import path from 'path';

const url = 'https://b.zmtcdn.com/data/dish_photos/8df/ce8f5a6be104319ea298e5e87af748df.png';
const dest = path.resolve('./tmp/cake_final.png');

if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp');

axios.get(url, { responseType: 'arraybuffer' })
  .then(response => {
    fs.writeFileSync(dest, Buffer.from(response.data, 'binary'));
    console.log(`✅ DOWNLOADED: ${dest} (${response.data.byteLength} bytes)`);
  })
  .catch(err => {
    console.error(`🚨 DOWNLOAD FAILED: ${err.message}`);
  });
