const express = require('express');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// 🎵 Endpoint para streaming de audio
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

    const protocol = radioParsed.protocol === 'https:' ? https : http;

    const radioRequest = protocol.request(options, (radioResponse) => {
        res.writeHead(200, {
            'Content-Type': radioResponse.headers['content-type'] || 'audio/mpeg',
            'Access-Control-Allow-Origin': '*',
            'Icy-Name': radioResponse.headers['icy-name'] || '',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            // ✅ Forzar modo de audio "media" en Android
            'Audio-Mode': 'media'
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

// 📜 Endpoint para obtener metadatos
app.get('/metadata', async (req, res) => {
    const radioUrl = req.query.url;
    if (!radioUrl) {
        return res.status(400).json({ error: 'Falta parámetro "url"' });
    }

    let radioParsed;
    try {
        radioParsed = new URL(radioUrl);
    } catch (e) {
        return res.status(400).json({ error: 'URL inválida' });
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

    const protocol = radioParsed.protocol === 'https:' ? https : http;

    try {
        const metadata = await getIcyMetadata(protocol, options);
        res.json({ metadata });
    } catch (err) {
        res.status(500).json({ error: 'No se pudieron obtener metadatos' });
    }
});

function getIcyMetadata(protocol, options) {
    return new Promise((resolve, reject) => {
        const req = protocol.request(options, (res) => {
            const metaInt = res.headers['icy-metaint'];
            if (!metaInt) {
                return resolve(null);
            }

            let bytesReceived = 0;
            const metaIntNum = parseInt(metaInt, 10);

            res.on('data', (chunk) => {
                if (bytesReceived < metaIntNum) {
                    bytesReceived += chunk.length;
                } else {
                    const metaLength = chunk[0] * 16;
                    if (metaLength > 0) {
                        const metaStart = 1;
                        const metaEnd = metaStart + metaLength;
                        if (chunk.length >= metaEnd) {
                            const metaBuffer = chunk.slice(metaStart, metaEnd);
                            const metaData = metaBuffer.toString('utf-8').trim();
                            const match = metaData.match(/StreamTitle='([^']*)'/);
                            if (match && match[1]) {
                                resolve(match[1].trim());
                            } else {
                                resolve(null);
                            }
                        }
                    }
                    res.destroy();
                }
            });

            res.on('error', reject);
            res.on('end', () => resolve(null));
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        req.end();
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Proxy ChofiRadios corriendo en puerto ${PORT}`);
});
