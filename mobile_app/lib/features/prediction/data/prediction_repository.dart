import '../../../core/network/api_client.dart';
import 'models/current_predictions_response.dart';

class PredictionRepository {
  PredictionRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<CurrentPredictionsResponse> fetchCurrentPredictions({
    String lotteryCode = 'dlt',
  }) async {
    final data = await _apiClient.post(
      '/predictions/current',
      data: {'lottery_code': lotteryCode},
    );
    return CurrentPredictionsResponse.fromMap(data);
  }
}
