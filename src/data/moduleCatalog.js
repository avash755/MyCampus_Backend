const MODULE_TEMPLATES = [
  ['Communication Skill Development', 1, '3 to 4 hours'],
  ['How to Create a Presentation', 1, '3 to 4 hours'],
  ['Effective Event Management Systems', 1, '3 to 4 hours'],
  ['English Spoken Proficiency', 60, '1 hour per day'],
  ['Leadership Skill Development', 1, '3 to 4 hours'],
  ['Career Guideline', 1, '3 to 4 hours'],
  ['Professional Digital Literacy and Workplace Technology', 3, '2 hours per day'],
  ['Team works management', 1, '3 to 4 hours'],
  ['How to develop a Data management & analysis System', 1, '3 to 4 hours'],
  ['How to Enhance Your Decision-Making Skills', 1, '3 to 4 hours'],
  ['Mastering the Art of Time Management', 1, '3 to 4 hours'],
  ['How to Become an Entrepreneur', 1, '3 to 4 hours'],
  ['How to Enhance Your Public Relations Skills', 1, '3 to 4 hours'],
  ['How to Use of Technology in Education', 1, '3 to 4 hours'],
  ['Understand Student Psychology', 1, '3 to 4 hours'],
  ['Time Management and Work Ethics', 1, '3 to 4 hours'],
  ['Improving Problem-Solving Skills', 1, '3 to 4 hours'],
  ['Stress Management and Relaxation Techniques', 1, '3 to 4 hours'],
  ['Developing Creativity in Students', 1, '3 to 4 hours'],
  ['Cultural Awareness for Stronger Relationships', 1, '3 to 4 hours'],
  ['How to develop a Creative Idea in a student', 1, '3 to 4 hours'],
  ['The Art of Project Planning', 1, '3 to 4 hours'],
  ['How to improved Developing Research Skills', 1, '3 to 4 hours'],
  ['Professional Grooming and Corporate Etiquette', 1, '3 to 4 hours'],
  ['Mastering the Job Application Process (CV, Cover Letter & Interviewing)', 1, '3 to 4 hours']
].map(([title, durationDays, scheduleLabel], index) => ({
  number: index + 1,
  title,
  durationDays,
  scheduleLabel
}));

module.exports = { MODULE_TEMPLATES };
