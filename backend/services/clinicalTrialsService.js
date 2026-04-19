/**
 * clinicalTrialsService.js
 * Retrieves clinical trials from ClinicalTrials.gov API v2
 * Supports location filtering and status filtering
 */

const axios = require('axios');

const CT_BASE = 'https://clinicaltrials.gov/api/v2';

/**
 * Search ClinicalTrials.gov
 */
async function getClinicalTrials(params) {
  const {
    condition,
    intervention = '',
    location = '',
    status = ['RECRUITING', 'NOT_YET_RECRUITING', 'ACTIVE_NOT_RECRUITING'],
    maxResults = 50
  } = params;
  
  console.log(`🔍 ClinicalTrials searching: ${condition} + ${intervention}`);
  
  try {
    const queryParams = {
      'query.cond': condition,
      'query.intr': intervention,
      'filter.overallStatus': status.join(','),
      pageSize: Math.min(maxResults, 100),
      format: 'json',
      fields: [
        'NCTId', 'BriefTitle', 'OfficialTitle', 'BriefSummary',
        'DetailedDescription', 'OverallStatus', 'Phase', 'StudyType',
        'EligibilityCriteria', 'HealthyVolunteers', 'Gender', 'MinimumAge', 'MaximumAge',
        'LocationFacility', 'LocationCity', 'LocationCountry',
        'CentralContactName', 'CentralContactPhone', 'CentralContactEMail',
        'StartDate', 'PrimaryCompletionDate', 'InterventionName',
        'InterventionType', 'Condition', 'EnrollmentCount',
        'ResponsiblePartyInvestigatorFullName', 'LeadSponsorName'
      ].join(',')
    };
    
    if (location) {
      queryParams['query.locn'] = location;
    }
    
    const response = await axios.get(`${CT_BASE}/studies`, {
      params: queryParams,
      timeout: 15000
    });
    
    const studies = response.data?.studies || [];
    const trials = studies.map(parseClinicalTrial).filter(Boolean);
    
    console.log(`✅ ClinicalTrials returned ${trials.length} trials`);
    return trials;
  } catch (error) {
    console.error('ClinicalTrials error:', error.message);
    
    // Try fallback with simpler query
    return await getClinicalTrialsFallback(condition, maxResults);
  }
}

/**
 * Fallback with minimal params
 */
async function getClinicalTrialsFallback(condition, maxResults) {
  try {
    const response = await axios.get(`${CT_BASE}/studies`, {
      params: {
        'query.cond': condition,
        pageSize: maxResults,
        format: 'json'
      },
      timeout: 15000
    });
    
    return (response.data?.studies || []).map(parseClinicalTrial).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Parse a single clinical trial from API v2 response
 */
function parseClinicalTrial(study) {
  try {
    const proto = study?.protocolSection;
    if (!proto) return null;
    
    const id = proto?.identificationModule;
    const status = proto?.statusModule;
    const desc = proto?.descriptionModule;
    const eligibility = proto?.eligibilityModule;
    const contacts = proto?.contactsLocationsModule;
    const arms = proto?.armsInterventionsModule;
    const design = proto?.designModule;
    
    const nctId = id?.nctId;
    if (!nctId) return null;
    
    const title = id?.briefTitle || id?.officialTitle || 'Untitled Study';
    const summary = desc?.briefSummary || desc?.detailedDescription || '';
    
    // Parse locations
    const locations = (contacts?.locations || [])
      .slice(0, 5)
      .map(loc => ({
        facility: loc.facility,
        city: loc.city,
        state: loc.state,
        country: loc.country,
        status: loc.status
      }))
      .filter(loc => loc.facility || loc.city);
    
    // Parse contacts
    const centralContacts = (contacts?.centralContacts || []).slice(0, 2).map(c => ({
      name: c.name,
      phone: c.phone,
      email: c.email
    }));
    
    // Parse interventions
    const interventions = (arms?.interventions || [])
      .slice(0, 5)
      .map(i => `${i.type}: ${i.name}`)
      .filter(Boolean);
    
    // Parse eligibility
    const eligibilityText = eligibility?.eligibilityCriteria || '';
    const minAge = eligibility?.minimumAge || '';
    const maxAge = eligibility?.maximumAge || '';
    const gender = eligibility?.sex || 'ALL';
    const healthyVolunteers = eligibility?.healthyVolunteers || false;
    
    const overallStatus = status?.overallStatus || 'UNKNOWN';
    const startDate = status?.startDateStruct?.date || '';
    const completionDate = status?.primaryCompletionDateStruct?.date || '';
    
    const phases = design?.phases || [];
    const studyType = design?.studyType || '';
    const enrollment = design?.enrollmentInfo?.count || 0;
    
    const sponsor = proto?.sponsorCollaboratorsModule?.leadSponsor?.name || '';
    
    return {
      id: `ct_${nctId}`,
      nctId,
      title: cleanText(title),
      summary: cleanText(summary).slice(0, 1000),
      status: overallStatus,
      statusDisplay: formatStatus(overallStatus),
      phases,
      studyType,
      enrollmentCount: enrollment,
      eligibility: {
        criteria: cleanText(eligibilityText).slice(0, 800),
        minAge,
        maxAge,
        gender,
        healthyVolunteers
      },
      locations,
      contacts: centralContacts,
      interventions,
      sponsor,
      startDate,
      completionDate,
      url: `https://clinicaltrials.gov/study/${nctId}`,
      source: 'ClinicalTrials.gov',
      type: 'trial'
    };
  } catch {
    return null;
  }
}

function formatStatus(status) {
  const map = {
    'RECRUITING': '🟢 Recruiting',
    'NOT_YET_RECRUITING': '🔵 Not Yet Recruiting',
    'ACTIVE_NOT_RECRUITING': '🟡 Active (Not Recruiting)',
    'COMPLETED': '⚫ Completed',
    'TERMINATED': '🔴 Terminated',
    'WITHDRAWN': '⚫ Withdrawn',
    'SUSPENDED': '🟠 Suspended'
  };
  return map[status] || status;
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Get details for a specific trial by NCT ID
 */
async function getTrialDetails(nctId) {
  try {
    const response = await axios.get(`${CT_BASE}/studies/${nctId}`, {
      params: { format: 'json' },
      timeout: 10000
    });
    
    return parseClinicalTrial(response.data);
  } catch {
    return null;
  }
}

module.exports = { getClinicalTrials, getTrialDetails };