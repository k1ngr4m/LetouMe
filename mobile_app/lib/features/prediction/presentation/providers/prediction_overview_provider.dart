import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/prediction_repository.dart';

final predictionRepositoryProvider = Provider<PredictionRepository>((ref) => PredictionRepository());

final predictionSummaryProvider = FutureProvider<PredictionSummary>((ref) {
  return ref.watch(predictionRepositoryProvider).fetchSummary();
});
