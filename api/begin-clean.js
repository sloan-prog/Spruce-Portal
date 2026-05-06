const submission_id = fields.submissionID || '';
const property_id   = raw.q3_property_id || '';

if (!property_id) {
  console.log('Missing property_id. Keys:', Object.keys(raw));
  return res.status(400).json({ error: 'Missing property_id' });
}

const row = {
  submission_id:   String(submission_id),
  submission_date: new Date().toISOString(),
  property_id:     String(raw.q3_property_id  || ''),
  property_name:   String(raw.q5_property     || ''),
  bedrooms:        Number(raw.q6_beds)         || null,
  bathrooms:       Number(raw.q7_baths)        || null,
  sleeps:          Number(raw.q8_sleeps)       || null,
  estimated_hours: Number(raw.q9_estimated_hours) || null,
  plan_type:       String(raw.q12_plan_type    || ''),
  coffee_type:     String(raw.q10_coffee_type  || ''),
  clean_id:        String(raw.q14_clean_id     || ''),
  processed:       false,
};
