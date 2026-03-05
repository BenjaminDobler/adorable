
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// Pass API key via ANTHROPIC_API_KEY env var when running this script
const anthropic = new Anthropic();

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
