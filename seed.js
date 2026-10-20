require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const User = require('./src/db/models/user.model');
const Event = require('./src/db/models/event.model');
const CampusPost = require('./src/db/models/campusPost.model');

async function seed() {
  await connectDB();
  const password = await bcrypt.hash('Campus123!', 10);

  const admin = await User.findOneAndUpdate(
    { email: 'admin@mycampus.local' },
    { $set: { name: 'MyCampus Admin', email: 'admin@mycampus.local', password, role: 'admin', department: 'Student Affairs' } },
    { upsert: true, new: true, runValidators: true }
  );
  const student = await User.findOneAndUpdate(
    { email: 'student@mycampus.local' },
    { $set: { name: 'Alex Morgan', email: 'student@mycampus.local', password, role: 'student', department: 'Computer Science', studentId: 'MC-2048' } },
    { upsert: true, new: true, runValidators: true }
  );

  const eventSamples = [
    { title: 'Designing for a better campus', category: 'Workshop', description: 'A hands-on afternoon exploring user research, quick prototypes, and small ideas that improve everyday student life.', date: new Date(Date.now() + 2 * 86400000), time: '2:30 PM', location: 'Innovation Lab · Building A', organizer: admin._id, coverTone: 'violet' },
    { title: 'Fall welcome social', category: 'Social', description: 'Meet new people, find a club to join, and enjoy an easygoing evening with music and snacks on the lawn.', date: new Date(Date.now() + 5 * 86400000), time: '5:00 PM', location: 'Central Green', organizer: student._id, coverTone: 'peach' },
    { title: 'Portfolio review hour', category: 'Career', description: 'Bring a project or portfolio draft and get friendly feedback from senior students and volunteer mentors.', date: new Date(Date.now() + 8 * 86400000), time: '11:00 AM', location: 'Library · Room 204', organizer: admin._id, coverTone: 'mint' }
  ];
  for (const event of eventSamples) {
    await Event.findOneAndUpdate({ title: event.title }, { $setOnInsert: event }, { upsert: true, new: true });
  }

  const postSamples = [
    { title: 'Introduction to Human Computer Interaction', body: 'A clear set of lecture notes covering usability principles, user research methods, and the basics of prototyping.', category: 'resource', author: student._id, department: 'Computer Science', tags: ['Lecture notes', 'Year 2'], link: 'https://example.com/hci-notes', featured: true },
    { title: 'Blue water bottle found near the library', body: 'Found this bottle on the second floor study table around 3 PM. It is safe with the front desk.', category: 'lost-found', author: student._id, location: 'Library · Front desk', contact: 'student@mycampus.local' },
    { title: 'Summer product design internship', body: 'A sample opportunity listing for the prototype. Students should confirm details and apply directly through the organization.', category: 'opportunity', author: admin._id, department: 'All departments', tags: ['Internship', 'Design'], link: 'https://example.com/careers', deadline: new Date(Date.now() + 20 * 86400000), featured: true },
    { title: 'Student services desk hours', body: 'The student services desk is open weekdays from 9 AM to 4 PM this week.', category: 'notice', author: admin._id, department: 'Student Affairs' }
  ];
  for (const post of postSamples) {
    await CampusPost.findOneAndUpdate({ title: post.title, category: post.category }, { $setOnInsert: post }, { upsert: true, new: true });
  }

  console.log('Demo accounts and sample campus content are ready.');
  console.log('Demo student: student@mycampus.local / Campus123!');
  console.log('Demo admin: admin@mycampus.local / Campus123!');
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});