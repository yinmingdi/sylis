import type { TestHistoryItemDto } from '@sylis/shared/dto';
import { Card, Empty } from 'antd-mobile';
import ReactECharts from 'echarts-for-react';
import { useState, useEffect } from 'react';
import { AiOutlineHistory, AiOutlineTrophy } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { AppBar } from '../../../components/app-bar';
import { PageView } from '../../../components/view';
import { getTestHistory } from '../../../modules/vocabulary/api';

const VocabularyTestHistory = () => {
  const navigate = useNavigate();
  const [historyData, setHistoryData] = useState<TestHistoryItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTestHistory();
  }, []);

  const loadTestHistory = async () => {
    setIsLoading(true);
    try {
      const res = await getTestHistory({ page: 1, limit: 20 });
      setHistoryData(res.data.tests || []);
    } catch (error) {
      console.error('加载测试历史失败:', error);
      setHistoryData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 渲染图表
  const renderChart = () => {
    if (historyData.length === 0) {
      return null;
    }

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        formatter: (params: any) => {
          const data = params[0];
          const test = historyData[historyData.length - data.dataIndex - 1];
          return `${data.name}<br/>分数: ${data.value}分<br/>词汇量: ${test.estimatedVocabulary}`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: historyData
          .map((_, index) => `第${historyData.length - index}次`)
          .reverse(),
        axisTick: {
          alignWithLabel: true,
        },
        axisLabel: {
          interval: 0,
          rotate: historyData.length > 8 ? 45 : 0,
        },
      },
      yAxis: {
        type: 'value',
        max: 100,
        min: 0,
        axisLabel: {
          formatter: '{value}分',
        },
        splitLine: {
          lineStyle: {
            type: 'dashed',
          },
        },
      },
      series: [
        {
          name: '分数',
          type: 'bar',
          barWidth: '60%',
          data: historyData.map((test) => test.score).reverse(),
          itemStyle: {
            color: '#1677ff',
            borderRadius: [8, 8, 0, 0],
          },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}分',
            fontSize: 12,
            fontWeight: 'bold',
          },
          emphasis: {
            itemStyle: {
              color: '#0958d9',
            },
          },
        },
      ],
    };

    return (
      <Card className={styles.chartCard}>
        <h3 className={styles.chartTitle}>
          <AiOutlineHistory /> 成绩趋势
        </h3>
        <ReactECharts
          option={option}
          style={{ height: '280px', width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
      </Card>
    );
  };

  // 渲染历史列表
  const renderHistoryList = () => {
    if (historyData.length === 0) {
      return (
        <Empty
          description="暂无测试历史"
          imageStyle={{ width: 128 }}
        />
      );
    }

    return (
      <div className={styles.historyList}>
        {historyData.map((test, index) => (
          <Card key={test.id} className={styles.historyCard}>
            <div className={styles.historyItem}>
              <div className={styles.historyHeader}>
                <div className={styles.historyIndex}>
                  <AiOutlineTrophy />
                  <span>第 {historyData.length - index} 次测试</span>
                </div>
                <div className={styles.historyDate}>
                  {new Date(test.completedAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <div className={styles.historyStats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>分数</span>
                  <span className={styles.statValue}>{test.score}分</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>正确率</span>
                  <span className={styles.statValue}>
                    {test.correctCount}/{test.totalCount}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>预估词汇量</span>
                  <span className={styles.statValue}>
                    {test.estimatedVocabulary}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>水平</span>
                  <span className={styles.statValue}>{test.level}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <PageView
      className={styles.historyPage}
      appBar={
        <AppBar title="测试历史" onBack={() => navigate('/vocabulary-test')} />
      }
    >
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>加载中...</div>
        ) : (
          <>
            {renderChart()}
            {renderHistoryList()}
          </>
        )}
      </div>
    </PageView>
  );
};

export default VocabularyTestHistory;

