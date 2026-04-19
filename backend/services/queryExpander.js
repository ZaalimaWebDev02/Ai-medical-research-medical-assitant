/**
 * queryExpander.js
 * Intelligently expands medical queries using synonym mapping,
 * MeSH terms, and disease-specific terminology
 */

// Medical synonyms and related terms database
const MEDICAL_SYNONYMS = {
  "parkinson's disease": ["parkinson disease", "PD", "paralysis agitans", "idiopathic parkinsonism"],
  "parkinson": ["parkinson's disease", "parkinsonism", "PD"],
  "alzheimer": ["alzheimer's disease", "AD", "dementia", "cognitive decline"],
  "cancer": ["carcinoma", "malignancy", "tumor", "neoplasm", "oncology"],
  "lung cancer": ["NSCLC", "small cell lung cancer", "pulmonary carcinoma", "bronchogenic carcinoma"],
  "breast cancer": ["mammary carcinoma", "BRCA", "breast neoplasm", "ductal carcinoma"],
  "diabetes": ["diabetes mellitus", "T2DM", "T1DM", "hyperglycemia", "insulin resistance"],
  "heart disease": ["cardiovascular disease", "CVD", "coronary artery disease", "CAD", "cardiac"],
  "depression": ["major depressive disorder", "MDD", "clinical depression", "unipolar depression"],
  "anxiety": ["anxiety disorder", "GAD", "panic disorder", "PTSD"],
  "deep brain stimulation": ["DBS", "neuromodulation", "brain stimulation", "subthalamic nucleus"],
  "immunotherapy": ["immune checkpoint", "PD-1", "PD-L1", "CAR-T", "checkpoint inhibitor"],
  "stem cell": ["cell therapy", "regenerative medicine", "progenitor cells", "bone marrow transplant"],
  "CRISPR": ["gene editing", "gene therapy", "genome editing", "Cas9"],
  "multiple sclerosis": ["MS", "demyelinating disease", "relapsing-remitting MS", "RRMS"],
  "stroke": ["cerebrovascular accident", "CVA", "ischemic stroke", "hemorrhagic stroke", "TIA"],
  "obesity": ["BMI", "overweight", "metabolic syndrome", "bariatric"],
  "hypertension": ["high blood pressure", "HTN", "arterial hypertension"],
  "arthritis": ["rheumatoid arthritis", "RA", "osteoarthritis", "OA", "joint inflammation"],
  "epilepsy": ["seizure disorder", "convulsions", "antiepileptic"],
  "schizophrenia": ["psychosis", "antipsychotic", "hallucinations", "delusions"],
  "HIV": ["AIDS", "antiretroviral", "HAART", "human immunodeficiency virus"],
  "COVID": ["SARS-CoV-2", "coronavirus", "COVID-19", "long COVID", "post-COVID"]
};

// Treatment/intervention related expansions
const TREATMENT_SYNONYMS = {
  "treatment": ["therapy", "intervention", "management", "clinical outcome"],
  "drug": ["medication", "pharmaceutical", "pharmacological", "drug therapy"],
  "surgery": ["surgical", "operative", "procedure", "minimally invasive"],
  "prevention": ["prophylaxis", "preventive", "risk reduction"],
  "diagnosis": ["diagnostic", "biomarker", "screening", "detection"]
};

/**
 * Normalize text
 */
function normalize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove duplicate phrase if query == disease
 */
function uniqueParts(query, disease) {
  const q = normalize(query);
  const d = normalize(disease);

  if (q && d && q === d) return [query];

  if (q && d && q.includes(d)) return [query];

  return [query, disease].filter(Boolean);
}

/**
 * Expand a medical query intelligently
 * @param {Object} input - { query, disease, patientName, location }
 * @returns {Object} - { primaryQuery, expandedTerms, meshTerms, searchStrings }
 */
function expandQuery(input) {
  const { query, disease, patientName, location } = input;

  // FIXED combine query parts
  const parts = uniqueParts(query, disease);
  const baseQuery = parts.join(' ').toLowerCase().trim();

  // Find synonyms
  const expandedTerms = new Set();
  expandedTerms.add(baseQuery);

  // Check disease synonyms
  for (const [key, synonyms] of Object.entries(MEDICAL_SYNONYMS)) {
    if (baseQuery.includes(key.toLowerCase())) {
      synonyms.forEach((s) => expandedTerms.add(s));
    }
  }

  // Check treatment synonyms
  for (const [key, synonyms] of Object.entries(TREATMENT_SYNONYMS)) {
    if (baseQuery.includes(key.toLowerCase())) {
      synonyms.forEach((s) => expandedTerms.add(`${query} ${s}`));
    }
  }

  // Build PubMed search string
  const primaryTerms = parts;
  const pubmedString = buildPubMedQuery(primaryTerms, Array.from(expandedTerms));

  // FIXED OpenAlex duplicate issue
  const openAlexString = parts.join(' ');

  // FIXED ClinicalTrials duplicate issue
  const clinicalTrialsCondition = disease || query;
  const clinicalTrialsIntervention =
    disease && normalize(query) !== normalize(disease) ? query : '';

  return {
    primaryQuery: baseQuery,
    displayQuery: parts.join(' + '),
    expandedTerms: Array.from(expandedTerms).slice(0, 8),
    pubmedString: pubmedString.trim(),
    openAlexString: openAlexString.trim(),
    clinicalTrialsCondition: clinicalTrialsCondition.trim(),
    clinicalTrialsIntervention: clinicalTrialsIntervention.trim(),
    location: location || ''
  };
}

function buildPubMedQuery(primaryTerms, expandedTerms) {
  const mainConcept = primaryTerms[0]
    ? `"${primaryTerms[0]}"[Title/Abstract]`
    : '';

  const diseaseConcept = primaryTerms[1]
    ? `"${primaryTerms[1]}"[Title/Abstract]`
    : '';

  const synonymParts = expandedTerms
    .slice(0, 5)
    .map((t) => `"${t}"[Title/Abstract]`)
    .join(' OR ');

  let query = '';

  if (mainConcept && diseaseConcept) {
    query = `(${mainConcept} OR ${synonymParts}) AND ${diseaseConcept}`;
  } else if (mainConcept) {
    query = `(${mainConcept} OR ${synonymParts})`;
  } else {
    query = synonymParts;
  }

  return query;
}

/**
 * Handle follow-up queries using context memory
 */
function expandWithContext(newQuery, context) {
  const lowerQuery = newQuery.toLowerCase();

  const contextualPhrases = [
    'can i',
    'should i',
    'what about',
    'is it safe',
    'alternative',
    'side effect',
    'dosage',
    'interact',
    'combine',
    'also'
  ];

  const isFollowUp = contextualPhrases.some((phrase) =>
    lowerQuery.includes(phrase)
  );

  if (isFollowUp && context?.disease) {
    return expandQuery({
      query: newQuery,
      disease: context.disease,
      patientName: context.patientName,
      location: context.location
    });
  }

  let detectedDisease = null;

  for (const key of Object.keys(MEDICAL_SYNONYMS)) {
    if (lowerQuery.includes(key.toLowerCase())) {
      detectedDisease = key;
      break;
    }
  }

  return expandQuery({
    query: newQuery,
    disease: detectedDisease || context?.disease,
    patientName: context?.patientName,
    location: context?.location
  });
}

module.exports = { expandQuery, expandWithContext };