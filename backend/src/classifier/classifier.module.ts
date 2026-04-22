/**
 * Classifier Module
 * Provides ProblemClassifier service used by GeneratorAgent and cascade orchestrator.
 */

import { Module } from '@nestjs/common';
import { ProblemClassifier } from './problem.classifier';

@Module({
  providers: [ProblemClassifier],
  exports: [ProblemClassifier],
})
export class ClassifierModule {}
