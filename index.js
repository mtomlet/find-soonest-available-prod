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

// PRODUCTION All stylists at Phoenix Encanto
const ALL_STYLISTS = [
  // Original 18 stylists
  { id: '159793cd-bf26-4574-afcd-ac08017f2cf8', name: 'Josh' },
  { id: '2383ab00-8d63-4dac-9945-ac29014110eb', name: 'Jacob' },
  { id: '2044a8ce-be0d-4244-8c01-ac47010a2b18', name: 'Francis' },
  { id: '45362667-7c72-4c54-9b56-ac5b00f44d1b', name: 'Tiffany' },
  { id: '1b0119a5-abe8-444b-b56f-ac5b011095dc', name: 'Ashley' },
  { id: '71fa4533-7c1b-4195-89ed-ac5b0142182d', name: 'Libby' },
  { id: 'fe734b90-c392-48b5-ba4d-ac5b015d71ab', name: 'Lily' },
  { id: '4f185d55-4c46-4fea-bb3c-ac5b0171e6ce', name: 'Frank' },
  { id: '665c58c6-d8f3-4c0c-bfaf-ac5d0004b488', name: 'Britt' },
  { id: 'ee0adc0b-79de-4de9-8fd3-ac5d013c23eb', name: 'Angie' },
  { id: '8e916437-8d28-432b-b177-ac5e00dff9b9', name: 'Keren' },
  { id: '9b36f80e-0857-4fc6-ad42-ac5e00e6e8d7', name: 'Mari' },
  { id: 'f8567bde-87b8-4c3a-831e-ac61015f751b', name: 'Saskie' },
  { id: 'a7ef7d83-28d7-4bf5-a934-ac6f011cd3c4', name: 'Melanie' },
  { id: 'cbdbf3d3-0531-464f-996b-ac870143b967', name: 'Sarah' },
  { id: '5dc967f1-8606-4696-9871-ad4f0110cb33', name: 'Kristina' },
  { id: '452b3db2-0e3d-42bb-824f-ad5700082962', name: 'Kristen' },
  { id: '1875e266-ba30-48a5-ab3b-ad670141b4d0', name: 'Danielle' },
  // 19 NEW stylists added Jan 2026
  { id: '8b243661-a884-4b9d-8223-ad95012b64dd', name: 'Ellie' },
  { id: '0ab425dd-7614-4b3e-90bf-adcd00f6e969', name: 'Bella' },
  { id: '9c873dfb-b582-4132-a5fe-ae54006282f3', name: 'Holly' },
  { id: '04fa6efa-0a7a-4875-abb3-ae6e010d925c', name: 'Jackie' },
  { id: 'f800b8c0-5ecc-48c3-81a6-aeec010f012a', name: 'Mano' },
  { id: '01705d4b-597c-48b2-9391-af7e012ff596', name: 'Jackiev' },
  { id: 'f1c51a77-6b6f-4ca1-8780-afd9011cf4e9', name: 'Bianca' },
  { id: '389c987f-c7b6-43ac-9cb1-afe3013911ef', name: 'Maricruz' },
  { id: 'a566f6d7-62fa-417b-9032-afe70120760e', name: 'Dawnele' },
  { id: 'e3fe57d4-5745-4f9c-bc93-afe8013d1e40', name: 'Harmony' },
  { id: '2a543a56-c40f-492c-a2b8-b07b01099ed2', name: 'MJ' },
  { id: '49185114-423f-4c8a-a52e-b0c00129a9e8', name: 'Hannah' },
  { id: 'a1773d20-8d64-43e1-8cb5-b1560127614b', name: 'Jocelyn' },
  { id: '56f120d3-a76f-43bc-902e-b19f004114a6', name: 'Ulises' },
  { id: '466345e1-6b4c-4028-98e3-b1c6011a6d36', name: 'Anahi' },
  { id: '60aadea7-4962-47ef-97f9-b237011c85e1', name: 'Juan' },
  { id: '3971a6d5-5746-4f30-bdc4-b265013f8707', name: 'Lauren' },
  { id: '6c52327c-3aa4-427e-b83a-b26c01410025', name: 'Eunice' },
  { id: '097168c0-322c-40b2-a1d7-b28b011bae31', name: 'Nadia' }
];

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

  console.log(`PRODUCTION: Scanning all ${ALL_STYLISTS.length} barbers for soonest availability...`);
  console.log(`Date range: ${startDate} to ${endDate} (hard-coded 3 days)`);
  console.log(`Service: ${serviceId} (hard-coded)`);
  if (addonServiceIds.length > 0) {
    console.log(`Add-on services: ${addonServiceIds.join(', ')}`);
  }

  try {
    const token = await getMeevoToken();

    const scanPromises = ALL_STYLISTS.map(async (stylist) => {
      // Build ScanServices array - primary service + any add-ons
      const scanServices = [{ ServiceId: serviceId, EmployeeIds: [stylist.id] }];

      // Add any add-on services to find slots that fit the full package
      for (const addonId of addonServiceIds) {
        scanServices.push({ ServiceId: addonId, EmployeeIds: [stylist.id] });
      }

      const scanRequest = {
        LocationId: parseInt(CONFIG.LOCATION_ID),
        TenantId: parseInt(CONFIG.TENANT_ID),
        ScanDateType: 1,
        StartDate: startDate,
        EndDate: endDate,
        ScanTimeType: 1,
        StartTime: '00:00',
        EndTime: '23:59',
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
        console.error(`PRODUCTION: Error scanning ${stylist.name}:`, error.message);
        return [];
      }
    });

    const allResults = await Promise.all(scanPromises);
    const allOpenings = allResults.flat();

    if (allOpenings.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: 'No availability found across any barbers in the next 3 days',
        date_range: { start: startDate, end: endDate },
        barbers_scanned: ALL_STYLISTS.length
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
      barbers_scanned: ALL_STYLISTS.length,
      date_range: { start: startDate, end: endDate },
      all_openings: allOpenings.slice(0, 20),
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
    version: '1.2.0',
    description: 'Hard-coded: scans all barbers, now to 3 days out. Supports additional_services for add-ons.',
    features: ['formatted date fields (day_of_week, formatted_date, formatted_time, formatted_full)'],
    stylists_count: ALL_STYLISTS.length
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PRODUCTION Find Soonest Available listening on port ${PORT}`);
  console.log(`Scanning ${ALL_STYLISTS.length} barbers at Phoenix Encanto`);
  console.log(`Hard-coded: NOW to 3 days out, default service: Men's Haircut`);
});
