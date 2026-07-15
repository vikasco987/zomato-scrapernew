const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const match = html.match(/<script>(.*?)<\/script>/s);
if (match) {
    fs.writeFileSync('temp.js', match[1]);
}
