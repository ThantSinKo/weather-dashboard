const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const axios = require('axios');

// Configuration from environment variables
const INFLUXDB_URL = process.env.INFLUXDB_URL || 'http://localhost:8086';
const INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN;
const INFLUXDB_ORG = process.env.INFLUXDB_ORG;
const INFLUXDB_BUCKET = process.env.INFLUXDB_BUCKET;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const CITY = process.env.CITY || 'Bangkok';
const INTERVAL = parseInt(process.env.INTERVAL) || 300000; // 5 minutes default

console.log('Weather Dashboard Collector Starting...');
console.log(`City: ${CITY}`);
console.log(`Interval: ${INTERVAL / 1000} seconds`);
console.log(`InfluxDB URL: ${INFLUXDB_URL}`);

// Initialize InfluxDB client
const influxDB = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN });
const writeApi = influxDB.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET);

// Function to fetch weather data
async function fetchWeatherData() {
    try {
        if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY === '') {
            console.log('⚠️  No valid OpenWeather API key provided. Using mock data...');
            return generateMockWeatherData();
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&appid=${OPENWEATHER_API_KEY}&units=metric`;
        const response = await axios.get(url);
        const data = response.data;

        return {
            temperature: data.main.temp,
            humidity: data.main.humidity,
            pressure: data.main.pressure,
            windSpeed: data.wind.speed,
            cloudiness: data.clouds.all,
            description: data.weather[0].description,
            feelsLike: data.main.feels_like
        };
    } catch (error) {
        console.error('Error fetching weather data:', error.message);
        console.log('Using mock data instead...');
        return generateMockWeatherData();
    }
}

// Generate mock weather data for demo purposes
function generateMockWeatherData() {
    const baseTemp = 28;
    const baseHumidity = 70;
    const basePressure = 1013;
    
    return {
        temperature: baseTemp + (Math.random() * 6 - 3), // ±3°C variation
        humidity: baseHumidity + (Math.random() * 20 - 10), // ±10% variation
        pressure: basePressure + (Math.random() * 10 - 5), // ±5 hPa variation
        windSpeed: Math.random() * 15, // 0-15 m/s
        cloudiness: Math.random() * 100, // 0-100%
        description: ['clear sky', 'few clouds', 'scattered clouds', 'broken clouds', 'light rain'][Math.floor(Math.random() * 5)],
        feelsLike: baseTemp + (Math.random() * 6 - 3)
    };
}

// Function to write data to InfluxDB
async function writeWeatherData(weatherData) {
    try {
        const point = new Point('weather')
            .tag('city', CITY)
            .floatField('temperature', weatherData.temperature)
            .floatField('humidity', weatherData.humidity)
            .floatField('pressure', weatherData.pressure)
            .floatField('wind_speed', weatherData.windSpeed)
            .floatField('cloudiness', weatherData.cloudiness)
            .floatField('feels_like', weatherData.feelsLike)
            .stringField('description', weatherData.description);

        writeApi.writePoint(point);
        await writeApi.flush();

        console.log(`✓ Weather data written: ${weatherData.temperature.toFixed(1)}°C, ${weatherData.humidity.toFixed(0)}% humidity`);
    } catch (error) {
        console.error('Error writing to InfluxDB:', error.message);
    }
}

// Main collection loop
async function collectWeatherData() {
    console.log('Collecting weather data...');
    const weatherData = await fetchWeatherData();
    await writeWeatherData(weatherData);
}

// Start collection immediately and then on interval
async function start() {
    // Wait a bit for InfluxDB to be ready
    console.log('Waiting for InfluxDB to be ready...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('Starting weather data collection...');
    
    // Collect immediately
    await collectWeatherData();
    
    // Then collect on interval
    setInterval(collectWeatherData, INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await writeApi.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await writeApi.close();
    process.exit(0);
});

// Start the application
start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
