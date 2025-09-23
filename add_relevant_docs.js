#!/usr/bin/env node

/**
 * Script to add relevant documents to improve RAG retrieval quality
 * This addresses the core issue: your system has Psychology docs but you ask ML questions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create sample documents about Machine Learning and AI
const sampleDocs = {
  'machine-learning-intro.txt': `# Machine Learning Fundamentals

## What is Machine Learning?

Machine Learning (ML) is a subset of artificial intelligence (AI) that enables computers to learn and make decisions from data without being explicitly programmed for every scenario.

### Types of Machine Learning

1. **Supervised Learning**: Learning from labeled data
   - Classification: Predicting categories (spam detection, image recognition)
   - Regression: Predicting continuous values (price prediction, weather forecasting)

2. **Unsupervised Learning**: Finding patterns in unlabeled data
   - Clustering: Grouping similar data points (customer segmentation)
   - Dimensionality Reduction: Simplifying data while preserving important information

3. **Reinforcement Learning**: Learning through interaction and rewards
   - Game playing (AlphaGo, chess engines)
   - Robotics and autonomous systems

## Key Concepts

### Training Data
The dataset used to teach the model patterns and relationships.

### Features
The measurable properties or characteristics of the data.

### Labels
The target outputs we want to predict (in supervised learning).

### Model
The mathematical representation that captures patterns from training data.

## Popular Algorithms

### Linear Regression
- Used for predicting continuous values
- Assumes linear relationship between features and target

### Decision Trees
- Tree-like model for classification and regression
- Easy to interpret and visualize

### Neural Networks
- Inspired by biological neural networks
- Powerful for complex pattern recognition
- Deep Learning uses multiple layers

### Support Vector Machines (SVM)
- Effective for classification tasks
- Works well with clear margin of separation

## Applications

- **Computer Vision**: Image recognition, object detection
- **Natural Language Processing**: Text analysis, translation
- **Recommendation Systems**: Product suggestions, content personalization
- **Medical Diagnosis**: Disease prediction, drug discovery
- **Financial Services**: Fraud detection, algorithmic trading
- **Autonomous Vehicles**: Self-driving cars, navigation

## Getting Started with ML

1. **Learn Python**: Primary language for ML
2. **Master Mathematics**: Linear algebra, calculus, statistics
3. **Choose a Framework**: TensorFlow, PyTorch, scikit-learn
4. **Practice with Datasets**: Kaggle, UCI Machine Learning Repository
5. **Build Projects**: Start with simple models, gradually increase complexity

Machine Learning is revolutionizing industries and creating new possibilities for automation and intelligent systems.`,

  'deep-learning-guide.txt': `# Deep Learning Guide

## Introduction to Deep Learning

Deep Learning is a subset of machine learning that uses artificial neural networks with multiple layers to model complex patterns in data.

## Neural Network Architecture

### Input Layer
Receives the initial data and passes it to hidden layers.

### Hidden Layers
Process the data through weighted connections and activation functions.
- **Dense Layers**: Fully connected neurons
- **Convolutional Layers**: Process spatial data (images)
- **Recurrent Layers**: Handle sequential data (text, time series)

### Output Layer
Produces the final prediction or classification.

## Key Components

### Neurons
Basic units that receive inputs, apply weights, and produce outputs through activation functions.

### Weights and Biases
Parameters that the network learns during training.
- **Weights**: Connection strengths between neurons
- **Biases**: Offset values that help the model fit better

### Activation Functions
Introduce non-linearity into the network:
- **ReLU**: Rectified Linear Unit, most commonly used
- **Sigmoid**: For binary classification
- **Softmax**: For multi-class classification
- **Tanh**: Hyperbolic tangent function

## Training Process

### Forward Propagation
Data flows from input to output layer, generating predictions.

### Loss Function
Measures the difference between predicted and actual values:
- **Mean Squared Error (MSE)**: For regression
- **Cross-Entropy Loss**: For classification

### Backpropagation
Algorithm that calculates gradients and updates weights to minimize loss.

### Optimization Algorithms
Methods to update weights efficiently:
- **Stochastic Gradient Descent (SGD)**
- **Adam**: Adaptive moment estimation
- **RMSprop**: Root mean square propagation

## Popular Deep Learning Frameworks

### TensorFlow
- Developed by Google
- Production-ready with TensorFlow Serving
- Strong visualization tools (TensorBoard)

### PyTorch
- Developed by Facebook
- More pythonic and flexible
- Excellent for research and experimentation

### Keras
- High-level API that runs on top of TensorFlow
- User-friendly for beginners
- Rapid prototyping

## Applications of Deep Learning

### Computer Vision
- Image classification and recognition
- Object detection and segmentation
- Facial recognition
- Medical image analysis

### Natural Language Processing
- Text classification and sentiment analysis
- Machine translation
- Chatbots and virtual assistants
- Text generation

### Generative Models
- GANs (Generative Adversarial Networks)
- VAEs (Variational Autoencoders)
- Creating new images, music, and text

## Best Practices

### Data Preparation
- Normalize and standardize input data
- Handle missing values appropriately
- Split data into training, validation, and test sets

### Model Architecture
- Start simple and gradually increase complexity
- Use appropriate layer types for your data
- Consider pre-trained models for transfer learning

### Training Tips
- Use early stopping to prevent overfitting
- Implement dropout for regularization
- Monitor training with validation metrics
- Use learning rate scheduling

### Deployment
- Optimize models for inference speed
- Consider model compression techniques
- Implement proper error handling
- Monitor model performance in production

Deep Learning has achieved remarkable success in various domains and continues to advance the field of artificial intelligence.`,

  'ai-ethics.txt': `# Artificial Intelligence Ethics

## Introduction

As AI systems become increasingly powerful and integrated into our daily lives, ethical considerations become crucial for responsible development and deployment.

## Key Ethical Principles

### Fairness and Bias
- **Algorithmic Bias**: When AI systems reflect or amplify societal biases
- **Fair Representation**: Ensuring diverse and representative training data
- **Equal Treatment**: Avoiding discrimination in AI decision-making

### Transparency and Explainability
- **Black Box Problem**: Understanding how AI models make decisions
- **Explainable AI (XAI)**: Making AI reasoning interpretable to humans
- **Auditability**: Ability to review and verify AI system behavior

### Privacy and Data Protection
- **Data Minimization**: Collecting only necessary data
- **Consent and Control**: User control over their data
- **Security**: Protecting sensitive information from breaches

### Accountability and Responsibility
- **Human Oversight**: Maintaining human involvement in critical decisions
- **Liability**: Determining responsibility for AI system actions
- **Continuous Monitoring**: Regular assessment of AI system performance

## Bias in AI Systems

### Types of Bias
- **Sampling Bias**: Unrepresentative training data
- **Labeling Bias**: Inaccurate or biased data annotations
- **Algorithmic Bias**: Biased decision-making in the model itself

### Detecting and Mitigating Bias
- **Bias Audits**: Regular assessment of AI system fairness
- **Diverse Development Teams**: Including varied perspectives in AI development
- **Bias Detection Tools**: Automated tools to identify potential biases
- **Fairness Metrics**: Quantitative measures of algorithmic fairness

## AI Safety and Alignment

### Safety Concerns
- **Unintended Consequences**: Unexpected negative outcomes from AI systems
- **Value Alignment**: Ensuring AI goals match human values
- **Robustness**: AI systems performing reliably under various conditions

### Safety Measures
- **Red Teaming**: Testing AI systems for potential failures
- **Safety Constraints**: Built-in limitations and safeguards
- **Monitoring and Shutdown**: Ability to detect and stop unsafe behavior

## Societal Impact

### Employment and Economy
- **Job Displacement**: Potential loss of jobs due to automation
- **New Opportunities**: Creation of new roles and industries
- **Skills Gap**: Need for retraining and upskilling workers

### Social Equity
- **Digital Divide**: Ensuring AI benefits reach all communities
- **Access to Technology**: Preventing AI from exacerbating inequalities
- **Global Cooperation**: International collaboration on AI governance

## Regulatory Landscape

### Current Regulations
- **EU AI Act**: Comprehensive framework for AI regulation in Europe
- **US AI Initiatives**: Various federal and state-level AI policies
- **International Standards**: ISO and IEEE standards for AI ethics

### Industry Self-Regulation
- **Ethics Guidelines**: Company-specific AI ethics frameworks
- **Industry Coalitions**: Collaborative efforts to establish best practices
- **Certification Programs**: Third-party verification of ethical AI practices

## Future Considerations

### Advanced AI Systems
- **Artificial General Intelligence (AGI)**: Highly capable AI systems
- **Superintelligence**: AI surpassing human-level intelligence
- **Existential Risks**: Potential catastrophic outcomes from advanced AI

### Governance and Policy
- **International Cooperation**: Global frameworks for AI governance
- **Adaptive Regulation**: Flexible policies that evolve with technology
- **Public Engagement**: Involving citizens in AI policy decisions

## Conclusion

Ethical AI development requires balancing innovation with responsibility. By addressing these ethical considerations proactively, we can ensure that AI systems benefit society while minimizing potential harms. Ongoing dialogue between technologists, policymakers, and the public is essential for navigating the complex ethical landscape of artificial intelligence.`
};

// Create a function to save documents and create upload-ready files
function createSampleDocuments() {
  const docsDir = path.join(__dirname, 'sample_docs');

  // Create directory if it doesn't exist
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  console.log('📝 Creating sample documents for better RAG retrieval...\n');

  Object.entries(sampleDocs).forEach(([filename, content]) => {
    const filePath = path.join(docsDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Created: ${filename}`);
  });

  console.log(`\n📂 Documents saved to: ${docsDir}`);
  console.log('\n🚀 Next steps:');
  console.log('1. Upload these documents to your RAG system');
  console.log('2. Test questions about Machine Learning, AI, and Ethics');
  console.log('3. Compare retrieval quality before and after');

  console.log('\n💡 Sample questions to test:');
  console.log('- What is machine learning?');
  console.log('- Explain deep learning neural networks');
  console.log('- What are the ethical concerns with AI?');
  console.log('- How does supervised learning work?');
  console.log('- What is the difference between AI and machine learning?');
}

// Instructions for manual document addition
function showInstructions() {
  console.log('📋 INSTRUCTIONS: Adding Relevant Documents to Your RAG System\n');

  console.log('🔍 PROBLEM IDENTIFIED:');
  console.log('Your RAG system contains Psychology/Relationships documents');
  console.log('But you\'re asking questions about Machine Learning and AI');
  console.log('This causes irrelevant search results!\n');

  console.log('🛠️ SOLUTION: Add relevant documents\n');

  console.log('📁 METHOD 1: Use the API');
  console.log('POST /api/documents/upload');
  console.log('Upload files about: Machine Learning, AI, Computer Science, Technology\n');

  console.log('📁 METHOD 2: Use the web interface');
  console.log('1. Go to your RAG frontend');
  console.log('2. Upload documents about relevant topics');
  console.log('3. Supported formats: PDF, TXT\n');

  console.log('📚 RECOMMENDED TOPICS TO ADD:');
  console.log('• Machine Learning tutorials and guides');
  console.log('• AI ethics and responsible AI documents');
  console.log('• Deep Learning research papers');
  console.log('• Computer Science textbooks');
  console.log('• Technology whitepapers');
  console.log('• Programming and algorithms documentation\n');

  console.log('🎯 EXPECTED IMPROVEMENT:');
  console.log('• Higher relevance scores (>0.8 similarity)');
  console.log('• Answers directly related to your questions');
  console.log('• Better confidence scores in responses');
  console.log('• More accurate and helpful information\n');

  console.log('🔍 TESTING: After adding documents, test with:');
  console.log('• "What is machine learning?"');
  console.log('• "Explain neural networks"');
  console.log('• "What are AI ethics concerns?"\n');
}

// Run the script
const command = process.argv[2];

if (command === '--create-docs') {
  createSampleDocuments();
} else if (command === '--instructions') {
  showInstructions();
} else {
  console.log('🔧 RAG Document Improvement Script\n');
  console.log('Usage:');
  console.log('  node add_relevant_docs.js --create-docs    # Create sample ML/AI documents');
  console.log('  node add_relevant_docs.js --instructions   # Show detailed instructions');
  console.log('');
  showInstructions();
}


