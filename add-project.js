const { MongoClient } = require('mongodb');

async function addProject() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db('qa-app');
    const users = database.collection('users');
    const projects = database.collection('projects');

    // Get all user IDs
    const allUsers = await users.find({}, { projection: { _id: 1 } }).toArray();
    const userIds = allUsers.map(user => user._id);

    const newProject = {
      title: 'Kuma Ep 02',
      description: 'Turkish animation dubbing project - Episode 2',
      sourceLanguage: 'Turkish',
      assignedTo: userIds,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await projects.insertOne(newProject);
    console.log('New project added with ID:', result.insertedId);
    console.log('Project assigned to', userIds.length, 'users');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

addProject().catch(console.error); 