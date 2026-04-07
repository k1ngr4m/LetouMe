import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../../data/models/my_bet_record.dart';
import '../my_bet_form_logic.dart';
import '../providers/my_bets_provider.dart';

class MyBetDetailPage extends ConsumerStatefulWidget {
  const MyBetDetailPage({
    required this.recordId,
    super.key,
  });

  final int recordId;

  @override
  ConsumerState<MyBetDetailPage> createState() => _MyBetDetailPageState();
}

class _MyBetDetailPageState extends ConsumerState<MyBetDetailPage> {
  bool _isEditing = false;
  bool _isSubmitting = false;
  String? _submitError;
  late final TextEditingController _targetPeriodController;
  late final TextEditingController _discountController;
  List<EditableBetLine> _lines = const [];

  @override
  void initState() {
    super.initState();
    _targetPeriodController = TextEditingController();
    _discountController = TextEditingController();
  }

  @override
  void dispose() {
    _targetPeriodController.dispose();
    _discountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final detailAsync = ref.watch(myBetDetailProvider(widget.recordId));
    return FeaturePageScaffold(
      title: '投注详情',
      actions: [
        detailAsync.maybeWhen(
          data: (record) => IconButton(
            onPressed: () {
              if (!_isEditing) {
                _hydrateForm(record);
              }
              setState(() {
                _submitError = null;
                _isEditing = !_isEditing;
              });
            },
            icon: Icon(_isEditing ? Icons.close : Icons.edit_outlined),
          ),
          orElse: () => const SizedBox.shrink(),
        ),
      ],
      children: [
        detailAsync.when(
          data: (record) {
            final quotes = _lines.map((line) => quoteLine(record.lotteryCode, line)).toList();
            final invalidIndex = quotes.indexWhere((item) => !item.valid);
            final totalBetCount = quotes.fold<int>(0, (sum, item) => sum + item.betCount);
            final totalAmount = quotes.fold<int>(0, (sum, item) => sum + item.amount);
            final discountAmount = int.tryParse(_discountController.text.trim()) ?? record.discountAmount;
            final discountError = discountAmount > totalAmount ? '优惠金额不能超过预计下注金额' : null;
            final submitHint = !_isEditing
                ? null
                : invalidIndex >= 0
                    ? '子单 #${invalidIndex + 1}：${quotes[invalidIndex].reason ?? '请检查号码'}'
                    : discountError;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _HeaderCard(record: record),
                const SizedBox(height: AppSpacing.lg),
                if (_isEditing) ...[
                  _EditOverviewCard(
                    targetPeriodController: _targetPeriodController,
                    discountController: _discountController,
                    totalBetCount: totalBetCount,
                    totalAmount: totalAmount,
                    submitHint: submitHint,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  ..._lines.asMap().entries.map(
                        (entry) => Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: _EditableLineCard(
                            lotteryCode: record.lotteryCode,
                            index: entry.key,
                            line: entry.value,
                            quote: quotes[entry.key],
                            canRemove: _lines.length > 1,
                            onChanged: (line) => _updateLine(entry.key, line),
                            onRemove: () => _removeLine(entry.key),
                          ),
                        ),
                      ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => _addLine(record.lotteryCode),
                      icon: const Icon(Icons.add),
                      label: const Text('新增一注'),
                    ),
                  ),
                  if (_submitError != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(_submitError!, style: TextStyle(color: theme.colorScheme.error)),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _isSubmitting || submitHint != null ? null : () => _submit(record),
                      child: Text(_isSubmitting ? '保存中...' : '保存修改'),
                    ),
                  ),
                ] else ...[
                  if (record.actualResult != null) ...[
                    _ActualResultCard(record: record),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  _ReadonlyLinesCard(record: record),
                ],
              ],
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.only(top: AppSpacing.xl),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, stack) => Text('投注详情加载失败：$error', style: theme.textTheme.bodyLarge),
        ),
      ],
    );
  }

  void _hydrateForm(MyBetRecord record) {
    _targetPeriodController.text = record.targetPeriod;
    _discountController.text = '${record.discountAmount}';
    _lines = record.lines.isEmpty
        ? [createEmptyEditableLine(record.lotteryCode)]
        : record.lines.map((line) => editableLineFromRecord(record.lotteryCode, line)).toList();
  }

  void _addLine(String lotteryCode) {
    setState(() {
      _lines = [..._lines, createEmptyEditableLine(lotteryCode)];
    });
  }

  void _removeLine(int index) {
    if (_lines.length <= 1) return;
    setState(() {
      _lines = [..._lines]..removeAt(index);
    });
  }

  void _updateLine(int index, EditableBetLine line) {
    final nextLines = [..._lines];
    nextLines[index] = line;
    setState(() {
      _lines = nextLines;
    });
  }

  Future<void> _submit(MyBetRecord original) async {
    setState(() {
      _isSubmitting = true;
      _submitError = null;
    });
    try {
      final payload = UpdateMyBetPayload(
        recordId: original.id,
        lotteryCode: original.lotteryCode,
        targetPeriod: _targetPeriodController.text.trim(),
        discountAmount: int.tryParse(_discountController.text.trim()) ?? 0,
        sourceType: original.sourceType,
        ticketImageUrl: original.ticketImageUrl,
        ocrText: original.ocrText,
        ocrProvider: original.ocrProvider,
        ocrRecognizedAt: original.ocrRecognizedAt,
        ticketPurchasedAt: original.ticketPurchasedAt,
        lines: _lines.map((line) => buildUpdateLinePayload(original.lotteryCode, line)).toList(),
      );
      await ref.read(myBetsRepositoryProvider).updateRecord(payload);
      ref.invalidate(myBetsListProvider);
      ref.invalidate(myBetDetailProvider(widget.recordId));
      setState(() {
        _isEditing = false;
      });
    } catch (error) {
      setState(() {
        _submitError = error.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.record});

  final MyBetRecord record;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('第 ${record.targetPeriod} 期', style: theme.textTheme.headlineMedium),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '${formatPlayType(record.playType)} · ${record.settlementStatus == 'settled' ? '已结算' : '待开奖'} · 实付 ${record.netAmount} 元',
            style: theme.textTheme.bodyLarge,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '投注 ${record.betCount} 注 · 奖金 ${record.prizeAmount} 元 · 盈亏 ${record.netProfit} 元',
            style: theme.textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _ActualResultCard extends StatelessWidget {
  const _ActualResultCard({required this.record});

  final MyBetRecord record;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final redBalls = (record.actualResult?['red_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList();
    final blueBalls = (record.actualResult?['blue_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList();
    final digits = (record.actualResult?['digits'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList();
    final content = record.lotteryCode == 'dlt'
        ? '${redBalls.join(' ')}${blueBalls.isEmpty ? '' : ' + ${blueBalls.join(' ')}'}'
        : digits.isNotEmpty
            ? digits.join(' ')
            : redBalls.join(' ');
    return PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('开奖结果', style: theme.textTheme.titleLarge),
          const SizedBox(height: AppSpacing.sm),
          Text(content, style: theme.textTheme.bodyLarge),
        ],
      ),
    );
  }
}

class _ReadonlyLinesCard extends StatelessWidget {
  const _ReadonlyLinesCard({required this.record});

  final MyBetRecord record;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('投注子单', style: theme.textTheme.titleLarge),
          const SizedBox(height: AppSpacing.sm),
          ...record.lines.map(
            (line) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('第 ${line.lineNo} 注 · ${formatPlayType(line.playType)}', style: theme.textTheme.titleMedium),
                    const SizedBox(height: AppSpacing.xs),
                    Text(formatLinePreview(record.lotteryCode, line), style: theme.textTheme.bodyLarge),
                    const SizedBox(height: AppSpacing.xs),
                    Text('倍投 ${line.multiplier} · 金额 ${line.amount} 元', style: theme.textTheme.bodyMedium),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EditOverviewCard extends StatelessWidget {
  const _EditOverviewCard({
    required this.targetPeriodController,
    required this.discountController,
    required this.totalBetCount,
    required this.totalAmount,
    required this.submitHint,
  });

  final TextEditingController targetPeriodController;
  final TextEditingController discountController;
  final int totalBetCount;
  final int totalAmount;
  final String? submitHint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final discount = int.tryParse(discountController.text.trim()) ?? 0;
    final netAmount = totalAmount - discount < 0 ? 0 : totalAmount - discount;
    return PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: targetPeriodController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '期号'),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: discountController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '优惠金额'),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('预计 $totalBetCount 注 · 总金额 $totalAmount 元 · 实付 $netAmount 元', style: theme.textTheme.bodyLarge),
          if (submitHint != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(submitHint!, style: TextStyle(color: theme.colorScheme.error)),
          ],
        ],
      ),
    );
  }
}

class _EditableLineCard extends StatelessWidget {
  const _EditableLineCard({
    required this.lotteryCode,
    required this.index,
    required this.line,
    required this.quote,
    required this.canRemove,
    required this.onChanged,
    required this.onRemove,
  });

  final String lotteryCode;
  final int index;
  final EditableBetLine line;
  final LineQuote quote;
  final bool canRemove;
  final ValueChanged<EditableBetLine> onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final playTypes = playTypeOptionsForLottery(lotteryCode);
    return PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('第 ${index + 1} 注', style: theme.textTheme.titleMedium)),
              if (playTypes.length > 1)
                DropdownButton<String>(
                  value: line.playType,
                  onChanged: (value) => value == null ? null : onChanged(createEmptyEditableLine(lotteryCode).copyWith(playType: value, multiplier: line.multiplier)),
                  items: playTypes
                      .map((playType) => DropdownMenuItem<String>(
                            value: playType,
                            child: Text(formatPlayType(playType)),
                          ))
                      .toList(),
                ),
              if (canRemove)
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.delete_outline),
                ),
            ],
          ),
          ..._buildFields(context),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  key: ValueKey('multiplier-$index-${line.multiplier}'),
                  initialValue: '${line.multiplier}',
                  keyboardType: TextInputType.number,
                  onChanged: (value) => onChanged(line.copyWith(multiplier: int.tryParse(value) ?? 1)),
                  decoration: const InputDecoration(labelText: '倍投'),
                ),
              ),
              if (lotteryCode == 'dlt') ...[
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: SwitchListTile(
                    value: line.isAppend,
                    onChanged: (value) => onChanged(line.copyWith(isAppend: value)),
                    title: const Text('追加'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            quote.valid ? '预计 ${quote.betCount} 注 · ${quote.amount} 元' : '当前无效：${quote.reason ?? '请检查号码'}',
            style: quote.valid ? theme.textTheme.bodyMedium : TextStyle(color: theme.colorScheme.error),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildFields(BuildContext context) {
    switch (lotteryCode) {
      case 'dlt':
        if (line.playType == 'dlt_dantuo') {
          return [
            _input('前区胆码', line.frontDan, (value) => onChanged(line.copyWith(frontDan: value)), 'frontDan'),
            const SizedBox(height: AppSpacing.md),
            _input('前区拖码', line.frontTuo, (value) => onChanged(line.copyWith(frontTuo: value)), 'frontTuo'),
            const SizedBox(height: AppSpacing.md),
            _input('后区胆码', line.backDan, (value) => onChanged(line.copyWith(backDan: value)), 'backDan'),
            const SizedBox(height: AppSpacing.md),
            _input('后区拖码', line.backTuo, (value) => onChanged(line.copyWith(backTuo: value)), 'backTuo'),
          ];
        }
        return [
          _input('前区号码', line.frontNumbers, (value) => onChanged(line.copyWith(frontNumbers: value)), 'front'),
          const SizedBox(height: AppSpacing.md),
          _input('后区号码', line.backNumbers, (value) => onChanged(line.copyWith(backNumbers: value)), 'back'),
        ];
      case 'pl3':
        switch (line.playType) {
          case 'direct':
            return [
              _input('百位', line.directHundreds, (value) => onChanged(line.copyWith(directHundreds: value)), 'hundreds'),
              const SizedBox(height: AppSpacing.md),
              _input('十位', line.directTens, (value) => onChanged(line.copyWith(directTens: value)), 'tens'),
              const SizedBox(height: AppSpacing.md),
              _input('个位', line.directUnits, (value) => onChanged(line.copyWith(directUnits: value)), 'units'),
            ];
          case 'direct_sum':
          case 'group_sum':
            return [_input('和值', line.sumValues, (value) => onChanged(line.copyWith(sumValues: value)), 'sum')];
          default:
            return [_input('组选号码', line.groupNumbers, (value) => onChanged(line.copyWith(groupNumbers: value)), 'groups')];
        }
      case 'pl5':
        return [
          _input('万位', line.directTenThousands, (value) => onChanged(line.copyWith(directTenThousands: value)), 'tt'),
          const SizedBox(height: AppSpacing.md),
          _input('千位', line.directThousands, (value) => onChanged(line.copyWith(directThousands: value)), 'th'),
          const SizedBox(height: AppSpacing.md),
          _input('百位', line.directHundreds, (value) => onChanged(line.copyWith(directHundreds: value)), 'h'),
          const SizedBox(height: AppSpacing.md),
          _input('十位', line.directTens, (value) => onChanged(line.copyWith(directTens: value)), 't'),
          const SizedBox(height: AppSpacing.md),
          _input('个位', line.directUnits, (value) => onChanged(line.copyWith(directUnits: value)), 'u'),
        ];
      default:
        return [_input('号码', line.frontNumbers, (value) => onChanged(line.copyWith(frontNumbers: value)), 'numbers')];
    }
  }

  Widget _input(String label, String value, ValueChanged<String> onValueChanged, String fieldKey) {
    return TextFormField(
      key: ValueKey('$fieldKey-$index-$value'),
      initialValue: value,
      onChanged: onValueChanged,
      decoration: InputDecoration(labelText: '$label（空格分隔）'),
    );
  }
}
