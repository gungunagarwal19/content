const axios = require('axios');

function calculateAlgorithmicSearchVolume(keyword) {
  if (!keyword) return { volume: 720, cpc: 1.50, competition: 'MEDIUM', isEstimated: true };

  const words = keyword.toLowerCase().trim().split(/\s+/);
  const len = words.length;

  const highValueTerms = ['pricing', 'alternative', 'vs', 'software', 'platform', 'tool', 'automation', 'crm', 'ai', 'integration', 'best', 'top', 'api'];
  const hasHighIntent = words.some(w => highValueTerms.includes(w));

  let baseVolume = 1200;
  if (len === 1) baseVolume = 8500;
  else if (len === 2) baseVolume = 3400;
  else if (len === 3) baseVolume = 1600;
  else if (len === 4) baseVolume = 880;
  else baseVolume = 450;

  if (hasHighIntent) {
    baseVolume = Math.round(baseVolume * 1.6);
  }

  let charSum = 0;
  for (let i = 0; i < keyword.length; i++) {
    charSum += keyword.charCodeAt(i);
  }
  const variance = (charSum % 40) - 20;
  const finalVolume = Math.max(120, Math.round((baseVolume * (1 + variance / 100)) / 10) * 10);

  const cpcBase = hasHighIntent ? 3.80 : 1.45;
  const cpc = Number((cpcBase + ((charSum % 30) / 10)).toFixed(2));

  let competition = 'MEDIUM';
  if (hasHighIntent || finalVolume > 3000) competition = 'HIGH';
  else if (finalVolume < 500) competition = 'LOW';

  return {
    volume: finalVolume,
    cpc,
    competition,
    isEstimated: true
  };
}

async function fetchFromDataForSeo(keyword, login, password) {
  if (!login || !password) {
    throw new Error('DataForSEO credentials missing');
  }

  const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  const response = await axios.post(
    'https://api.dataforseo.com/v3/keywords_data/google/search_volume/live',
    [
      {
        language_name: 'English',
        location_code: 2840,
        keywords: [keyword]
      }
    ],
    {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    }
  );

  const result = response.data?.tasks?.[0]?.result?.[0];
  if (result) {
    return {
      volume: result.search_volume ?? 0,
      cpc: result.cpc ? Number(result.cpc.toFixed(2)) : 0,
      competition: result.competition_level || 'MEDIUM',
      isEstimated: false,
      source: 'DataForSEO'
    };
  }
  throw new Error('No DataForSEO task result returned');
}

async function fetchFromKeywordsEverywhere(keyword, apiKey) {
  if (!apiKey) {
    throw new Error('Keywords Everywhere API key missing');
  }

  const formData = new URLSearchParams();
  formData.append('country', 'us');
  formData.append('currency', 'USD');
  formData.append('kw[]', keyword);

  const response = await axios.post(
    'https://api.keywordseverywhere.com/v1/get_keyword_data',
    formData.toString(),
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 8000
    }
  );

  const data = response.data?.data?.[0];
  if (data) {
    return {
      volume: data.vol ?? 0,
      cpc: data.cpc ? Number(data.cpc.value || data.cpc) : 0,
      competition: data.competition > 0.6 ? 'HIGH' : (data.competition > 0.3 ? 'MEDIUM' : 'LOW'),
      isEstimated: false,
      source: 'Keywords Everywhere'
    };
  }
  throw new Error('No Keywords Everywhere result returned');
}

async function enrichKeywordData(keyword, settings = {}) {
  const result = {
    keyword,
    searchVolume: 0,
    cpc: 0,
    competition: 'MEDIUM',
    apiStatus: 'fallback',
    apiNotice: '',
    source: 'Heuristic'
  };

  const provider = settings.keywordProvider || 'heuristic_fallback';

  if (provider === 'dataforseo' && settings.dataForSeoLogin && settings.dataForSeoPassword) {
    try {
      const data = await fetchFromDataForSeo(keyword, settings.dataForSeoLogin, settings.dataForSeoPassword);
      return {
        keyword,
        searchVolume: data.volume,
        cpc: data.cpc,
        competition: data.competition,
        apiStatus: 'valid',
        apiNotice: 'DataForSEO API successful',
        source: 'DataForSEO'
      };
    } catch (err) {
      result.apiStatus = 'invalid_key';
      result.apiNotice = `DataForSEO API error (${err.response?.status || err.message}). Fallback applied.`;
    }
  }

  if (provider === 'keywords_everywhere' && settings.keywordsEverywhereApiKey) {
    try {
      const data = await fetchFromKeywordsEverywhere(keyword, settings.keywordsEverywhereApiKey);
      return {
        keyword,
        searchVolume: data.volume,
        cpc: data.cpc,
        competition: data.competition,
        apiStatus: 'valid',
        apiNotice: 'Keywords Everywhere API successful',
        source: 'Keywords Everywhere'
      };
    } catch (err) {
      result.apiStatus = 'invalid_key';
      result.apiNotice = `Keywords Everywhere API error (${err.response?.status || err.message}). Fallback applied.`;
    }
  }

  const estimate = calculateAlgorithmicSearchVolume(keyword);
  result.searchVolume = estimate.volume;
  result.cpc = estimate.cpc;
  result.competition = estimate.competition;

  if (result.apiStatus !== 'invalid_key') {
    result.apiStatus = 'unconfigured';
    result.apiNotice = 'Built-in volume estimation applied.';
  }

  return result;
}

module.exports = {
  enrichKeywordData,
  calculateAlgorithmicSearchVolume
};
