
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function listModels() {
  try {
    const list = await anthropic.models.list();
    console.log('Available models:');
    list.data.forEach(model => console.log(`- ${model.id}`));
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();
