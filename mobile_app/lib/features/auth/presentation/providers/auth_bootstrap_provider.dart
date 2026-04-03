import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../shared/providers/auth_state_provider.dart';
import '../../data/auth_repository.dart';

final authBootstrapProvider = FutureProvider<void>((ref) async {
  await ref.watch(authRepositoryProvider).restoreSession(ref.read(authStateProvider.notifier));
});
