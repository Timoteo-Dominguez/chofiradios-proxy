const express = require('express');
const http = require('http');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/proxy', (req, res) => {
    const radioUrl = req.query.url;
    if (!radioUrl) {
        return res.status(400).send('Falta parámetro "url"');
    }

    let radioParsed;
    try {
        radioParsed = new URL(radioUrl);
    } catch (e) {
        return res.status(400).send('URL inválida');
    }

    const options = {
        hostname: radioParsed.hostname,
        port: radioParsed.port || (radioParsed.protocol === 'https:' ? 443 : 80),
        path: radioParsed.pathname + (radioParsed.search || ''),
        method: 'GET',
        headers: {
            'Icy-MetaData': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Connection': 'close'
        }
    };

    const protocol = radioParsed.protocol === 'https:' ? require('https') : http;

    const radioRequest = protocol.request(options, (radioResponse) => {
        res.writeHead(200, {
            'Content-Type': radioResponse.headers['content-type'] || 'audio/mpeg',
            'Access-Control-Allow-Origin': '*',
            'Icy-Name': radioResponse.headers['icy-name'] || '',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        radioResponse.pipe(res);

        radioResponse.on('error', (err) => {
            console.error('Radio stream error:', err);
        });
    });

    radioRequest.on('error', (err) => {
        console.error('Proxy request error:', err);
        res.status(500).send('Error connecting to radio');
    });

    radioRequest.end();
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Proxy ChofiRadios corriendo en puerto ${PORT}`);
});
