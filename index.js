/**
 * Find Soonest Available - PRODUCTION (Phoenix Encanto)
 *
 * Hard-coded function that scans ALL barbers for the soonest available slot
 * from current time to 3 days out. NO INPUT REQUIRED from the agent.
 *
 * PRODUCTION CREDENTIALS - DO NOT USE FOR TESTING
 * Location: Keep It Cut - Phoenix Encanto (201664)
 *
 * Endpoint: POST /find-soonest
 *
 * Request Body: NONE REQUIRED (all parameters are hard-coded)
 *
 * Response:
 * {
 *   "success": true,
 *   "found": true,
 *   "earliest_slot": { datetime, employee_name, employee_id },
 *   "all_openings": [...up to 20 slots...],
 *   "date_range": { start, end }
 * }
 */

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// PRODUCTION Meevo API Configuration
const CONFIG = {
  AUTH_URL: 'https://marketplace.meevo.com/oauth2/token',
  API_URL: 'https://na1pub.meevo.com/publicapi/v1',
  API_URL_V2: 'https://na1pub.meevo.com/publicapi/v2',
  CLIENT_ID: 'f6a5046d-208e-4829-9941-034ebdd2aa65',
  CLIENT_SECRET: '2f8feb2e-51f5-40a3-83af-3d4a6a454abe',
  TENANT_ID: '200507',
  LOCATION_ID: '201664'  // Phoenix Encanto
};

// HARD-CODED: Default service (Men's Haircut in production)
const DEFAULT_SERVICE_ID = 'f9160450-0b51-4ddc-bcc7-ac150103d5c0';  // PRODUCTION: Haircut Standard

// PRODUCTION Service IDs (Phoenix Encanto) - for add-on resolution
const SERVICE_MAP = {
  'haircut_standard': 'f9160450-0b51-4ddc-bcc7-ac150103d5c0',
  'haircut standard': 'f9160450-0b51-4ddc-bcc7-ac150103d5c0',
  'standard': 'f9160450-0b51-4ddc-bcc7-ac150103d5c0',
  'haircut': 'f9160450-0b51-4ddc-bcc7-ac150103d5c0',
  'haircut_skin_fade': '14000cb7-a5bb-4a26-9f23-b0f3016cc009',
  'skin_fade': '14000cb7-a5bb-4a26-9f23-b0f3016cc009',
  'skin fade': '14000cb7-a5bb-4a26-9f23-b0f3016cc009',
  'fade': '14000cb7-a5bb-4a26-9f23-b0f3016cc009',
  'long_locks': '721e907d-fdae-41a5-bec4-ac150104229b',
  'long locks': '721e907d-fdae-41a5-bec4-ac150104229b',
  'wash': '67c644bc-237f-4794-8b48-ac150106d5ae',
  'shampoo': '67c644bc-237f-4794-8b48-ac150106d5ae',
  'grooming': '65ee2a0d-e995-4d8d-a286-ac150106994b',
  'beard': '65ee2a0d-e995-4d8d-a286-ac150106994b',
  'beard_trim': '65ee2a0d-e995-4d8d-a286-ac150106994b'
};

// Helper to resolve service name to ID
function resolveServiceId(input) {
  if (!input) return null;
  if (input.includes('-') && input.length > 30) return input;
  return SERVICE_MAP[input.toLowerCase().trim()] || null;
}

// ============================================
// DATE FORMATTING HELPERS
// Pre-formatted strings so LLM doesn't do date math
// ============================================

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

function getOrdinalSuffix(day) {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatDateParts(dateString) {
  const date = new Date(dateString + (dateString.includes('T') ? '' : 'T12:00:00'));
  const dayOfWeek = DAYS_OF_WEEK[date.getUTCDay()];
  const month = MONTHS[date.getUTCMonth()];
  const dayNum = date.getUTCDate();
  const dayWithSuffix = `${dayNum}${getOrdinalSuffix(dayNum)}`;
  return {
    day_of_week: dayOfWeek,
    formatted_date: `${month} ${dayWithSuffix}`,
    formatted_full_date: `${dayOfWeek}, ${month} ${dayWithSuffix}`
  };
}

function formatTime(timeString) {
  const timePart = timeString.split('T')[1];
  if (!timePart) return 'Time unavailable';
  const [hourStr, minStr] = timePart.split(':');
  let hours = parseInt(hourStr, 10);
  const minutes = parseInt(minStr, 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutesStr} ${ampm}`;
}

// ============================================
// DYNAMIC ACTIVE EMPLOYEE CACHE (1-hour TTL)
// ============================================
let cachedActiveEmployees = null;
let employeeCacheExpiry = null;
const EMPLOYEE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getActiveEmployees(authToken) {
  // Return cached if still valid
  if (cachedActiveEmployees && employeeCacheExpiry && Date.now() < employeeCacheExpiry) {
    console.log(`[Employees] Using cached list (${cachedActiveEmployees.length} active)`);
    return cachedActiveEmployees;
  }

  console.log('[Employees] Fetching active employees from Meevo...');
  try {
    const response = await axios.get(
      `${CONFIG.API_URL}/employees?tenantid=${CONFIG.TENANT_ID}&locationid=${CONFIG.LOCATION_ID}&ItemsPerPage=100`,
      { headers: { 'Authorization': `Bearer ${authToken}`, 'Accept': 'application/json' }, timeout: 5000 }
    );

    const employees = response.data?.data || [];

    // Filter: ObjectState 2026 = Active, exclude test accounts
    cachedActiveEmployees = employees
      .filter(emp => emp.objectState === 2026)
      .filter(emp => !['home', 'training', 'test'].includes((emp.firstName || '').toLowerCase()))
      .map(emp => ({
        id: emp.id,
        name: emp.nickName || emp.firstName
      }));

    employeeCacheExpiry = Date.now() + EMPLOYEE_CACHE_TTL;
    console.log(`[Employees] Cached ${cachedActiveEmployees.length} active employees`);
    return cachedActiveEmployees;
  } catch (err) {
    console.error('[Employees] Fetch failed:', err.message);
    // Return cached even if expired, or empty array
    return cachedActiveEmployees || [];
  }
}

let cachedToken = null;
let tokenExpiry = null;

async function getMeevoToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - (5 * 60 * 1000)) {
    return cachedToken;
  }

  console.log('PRODUCTION: Getting fresh token...');
  const response = await axios.post(CONFIG.AUTH_URL, {
    client_id: CONFIG.CLIENT_ID,
    client_secret: CONFIG.CLIENT_SECRET
  });

  cachedToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in * 1000);
  return cachedToken;
}

// Helper to get date in Arizona timezone (America/Phoenix)
function getArizonaDate(daysOffset = 0) {
  const now = new Date();
  const arizona = new Date(now.toLocaleString('en-US', { timeZone: 'America/Phoenix' }));
  arizona.setDate(arizona.getDate() + daysOffset);
  return arizona.toISOString().split('T')[0];
}

app.post('/find-soonest', async (req, res) => {
  // HARD-CODED: Always scan from NOW (Arizona time) to 3 days out
  const startDate = getArizonaDate(0);
  const endDate = getArizonaDate(3);

  // HARD-CODED: Default service (haircut)
  const serviceId = DEFAULT_SERVICE_ID;

  // Optional: additional_services for add-ons (wash, grooming)
  const { additional_services } = req.body || {};
  let addonServiceIds = [];
  if (additional_services && Array.isArray(additional_services)) {
    addonServiceIds = additional_services
      .map(s => resolveServiceId(s))
      .filter(s => s !== null);
  }

  try {
    const token = await getMeevoToken();

    // Get active employees dynamically (cached for 1 hour)
    const activeStylists = await getActiveEmployees(token);

    console.log(`PRODUCTION: Scanning all ${activeStylists.length} barbers for soonest availability...`);
    console.log(`Date range: ${startDate} to ${endDate} (hard-coded 3 days)`);
    console.log(`Service: ${serviceId} (hard-coded)`);
    if (addonServiceIds.length > 0) {
      console.log(`Add-on services: ${addonServiceIds.join(', ')}`);
    }

    // Meevo V2 API has 8-slot limit per request
    // Use 2hr windows with 1hr overlap (15 windows) to capture ALL slots including edge cases
    const TIME_WINDOWS = [
      { start: '06:00', end: '08:00' },
      { start: '07:00', end: '09:00' },
      { start: '08:00', end: '10:00' },
      { start: '09:00', end: '11:00' },
      { start: '10:00', end: '12:00' },
      { start: '11:00', end: '13:00' },
      { start: '12:00', end: '14:00' },
      { start: '13:00', end: '15:00' },
      { start: '14:00', end: '16:00' },
      { start: '15:00', end: '17:00' },
      { start: '16:00', end: '18:00' },
      { start: '17:00', end: '19:00' },
      { start: '18:00', end: '20:00' },
      { start: '19:00', end: '21:00' },
      { start: '20:00', end: '22:00' }
    ];

    const scanPromises = activeStylists.map(async (stylist) => {
      // Build ScanServices array - primary service + any add-ons
      const scanServices = [{ ServiceId: serviceId, EmployeeIds: [stylist.id] }];

      // Add any add-on services to find slots that fit the full package
      for (const addonId of addonServiceIds) {
        scanServices.push({ ServiceId: addonId, EmployeeIds: [stylist.id] });
      }

      // Scan all time windows in parallel for this stylist
      const windowScans = TIME_WINDOWS.map(async (window) => {
        const scanRequest = {
          LocationId: parseInt(CONFIG.LOCATION_ID),
          TenantId: parseInt(CONFIG.TENANT_ID),
          ScanDateType: 1,
          StartDate: startDate,
          EndDate: endDate,
          ScanTimeType: 1,
          StartTime: window.start,
          EndTime: window.end,
          ScanServices: scanServices
        };

        try {
          const response = await axios.post(
            `${CONFIG.API_URL_V2}/scan/openings?TenantId=${CONFIG.TENANT_ID}&LocationId=${CONFIG.LOCATION_ID}`,
            scanRequest,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          const rawData = response.data?.data || [];
          return rawData.flatMap(item =>
            (item.serviceOpenings || []).map(slot => {
              const dateParts = formatDateParts(slot.startTime);
              const formattedTime = formatTime(slot.startTime);
              return {
                startTime: slot.startTime,
                endTime: slot.endTime,
                date: slot.date,
                employee_id: stylist.id,
                employee_name: stylist.name,
                serviceId: slot.serviceId,
                serviceName: slot.serviceName,
                price: slot.employeePrice,
                day_of_week: dateParts.day_of_week,
                formatted_date: dateParts.formatted_date,
                formatted_time: formattedTime,
                formatted_full: `${dateParts.formatted_full_date} at ${formattedTime}`
              };
            })
          );
        } catch (error) {
          console.error(`PRODUCTION: Error scanning ${stylist.name} (${window.start}-${window.end}):`, error.message);
          return [];
        }
      });

      const windowResults = await Promise.all(windowScans);

      // Combine and deduplicate by startTime
      const seenTimes = new Set();
      return windowResults.flat().filter(slot => {
        if (seenTimes.has(slot.startTime)) return false;
        seenTimes.add(slot.startTime);
        return true;
      });
    });

    const allResults = await Promise.all(scanPromises);
    const allOpenings = allResults.flat();

    if (allOpenings.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: 'No availability found across any barbers in the next 3 days',
        date_range: { start: startDate, end: endDate },
        barbers_scanned: activeStylists.length
      });
    }

    allOpenings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const earliest = allOpenings[0];

    console.log(`PRODUCTION: Found ${allOpenings.length} total openings`);
    console.log(`Earliest: ${earliest.startTime} with ${earliest.employee_name}`);

    return res.json({
      success: true,
      found: true,
      earliest_slot: {
        datetime: earliest.startTime,
        end_time: earliest.endTime,
        employee_id: earliest.employee_id,
        employee_name: earliest.employee_name,
        service_id: serviceId,
        day_of_week: earliest.day_of_week,
        formatted_date: earliest.formatted_date,
        formatted_time: earliest.formatted_time,
        formatted_full: earliest.formatted_full
      },
      total_openings_found: allOpenings.length,
      barbers_scanned: activeStylists.length,
      date_range: { start: startDate, end: endDate },
      all_openings: allOpenings.slice(0, 100),
      message: `Next available: ${earliest.formatted_full} with ${earliest.employee_name}`
    });

  } catch (error) {
    console.error('PRODUCTION Error:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: 'PRODUCTION',
    location: 'Phoenix Encanto',
    service: 'Find Soonest Available',
    version: '2.1.0',
    description: 'Hard-coded: scans all barbers, now to 3 days out. Supports additional_services for add-ons.',
    features: [
      'DYNAMIC active employee fetching (1-hour cache)',
      'formatted date fields (day_of_week, formatted_date, formatted_time, formatted_full)',
      'full slot retrieval (6 parallel 3-hour scans to bypass 8-slot API limit)'
    ],
    stylists: 'dynamic (fetched from Meevo API)'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PRODUCTION Find Soonest Available listening on port ${PORT}`);
  console.log('Active stylists fetched dynamically from Meevo API (1-hour cache)');
  console.log(`Hard-coded: NOW to 3 days out, default service: Men's Haircut`);
});
