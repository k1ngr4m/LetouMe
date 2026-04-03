import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client_provider.dart';
import '../../data/prediction_repository.dart';
import '../../data/models/current_predictions_response.dart';

final selectedLotteryCodeProvider = StateProvider<String>((ref) => 'dlt');

final predictionRepositoryProvider = Provider<PredictionRepository>((ref) {
  return PredictionRepository(apiClient: ref.watch(apiClientProvider));
});

final currentPredictionsProvider = FutureProvider<CurrentPredictionsResponse>((ref) {
  final lotteryCode = ref.watch(selectedLotteryCodeProvider);
  return ref.watch(predictionRepositoryProvider).fetchCurrentPredictions(lotteryCode: lotteryCode);
});
