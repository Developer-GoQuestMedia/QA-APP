const { MongoClient, ObjectId } = require('mongodb');

async function addDialogues() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db('qa-app');
    const projects = database.collection('projects');
    const dialogues = database.collection('dialogues');

    // Get all projects
    const allProjects = await projects.find({}).toArray();

    for (const project of allProjects) {
      // Create sample dialogues for each project
      const sampleDialogues = [
        {
          project: project._id,
          index: 1,
          timeStart: "00:00:00",
          timeEnd: "00:00:05",
          character: "Character 1",
          videoUrl: "https://example.com/video1.mp4",
          dialogue: {
            original: "Hello, how are you?",
            translated: "",
            adapted: ""
          },
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          project: project._id,
          index: 2,
          timeStart: "00:00:05",
          timeEnd: "00:00:10",
          character: "Character 2",
          videoUrl: "https://example.com/video2.mp4",
          dialogue: {
            original: "I'm doing great, thank you!",
            translated: "",
            adapted: ""
          },
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          project: project._id,
          index: 3,
          timeStart: "00:00:10",
          timeEnd: "00:00:15",
          character: "Character 1",
          videoUrl: "https://example.com/video3.mp4",
          dialogue: {
            original: "Would you like some coffee?",
            translated: "",
            adapted: ""
          },
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const result = await dialogues.insertMany(sampleDialogues);
      console.log(`Added ${result.insertedCount} dialogues to project ${project.title}`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

addDialogues().catch(console.error); 