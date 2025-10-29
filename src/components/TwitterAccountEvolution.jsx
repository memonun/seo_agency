// Twitter Account Evolution Component
// Displays account growth and tweet evolution analysis

import React, { useState, useEffect } from 'react';
import { 
  getAccountEvolution, 
  getTweetEvolution, 
  getAccountPerformanceMetrics,
  compareAccountPeriods,
  getTrackedAccounts 
} from '../utils/twitterAccountEvolution';

const TwitterAccountEvolution = ({ user }) => {
  const [trackedAccounts, setTrackedAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [evolutionData, setEvolutionData] = useState(null);
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [periodComparison, setPeriodComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Load tracked accounts on component mount
  useEffect(() => {
    loadTrackedAccounts();
  }, []);

  const loadTrackedAccounts = async () => {
    try {
      const result = await getTrackedAccounts();
      if (result.success) {
        setTrackedAccounts(result.data);
        if (result.data.length > 0) {
          setSelectedAccount(result.data[0].username);
        }
      }
    } catch (error) {
      console.error('Failed to load tracked accounts:', error);
    }
  };

  const loadAccountData = async (username) => {
    if (!username) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [evolutionResult, metricsResult, comparisonResult] = await Promise.all([
        getAccountEvolution(username, 30),
        getAccountPerformanceMetrics(username, 30),
        compareAccountPeriods(username, 7, 7)
      ]);

      if (evolutionResult.success) {
        setEvolutionData(evolutionResult.data);
      }
      
      if (metricsResult.success) {
        setPerformanceMetrics(metricsResult.data);
      }
      
      if (comparisonResult.success) {
        setPeriodComparison(comparisonResult.data);
      }

    } catch (error) {
      setError(error.message);
      console.error('Failed to load account data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load data when selected account changes
  useEffect(() => {
    if (selectedAccount) {
      loadAccountData(selectedAccount);
    }
  }, [selectedAccount]);

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  };

  const formatPercentage = (num) => {
    const value = parseFloat(num);
    return isNaN(value) ? '0%' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getChangeColor = (value) => {
    const num = parseFloat(value);
    if (num > 0) return 'text-green-600';
    if (num < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  if (!user) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800">Please log in to view account evolution tracking.</p>
      </div>
    );
  }

  if (trackedAccounts.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          🔍 No Tracked Accounts Yet
        </h3>
        <p className="text-blue-800">
          Perform account-specific searches to start tracking Twitter accounts. 
          Once you search for an account, it will appear here with evolution data.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              📈 Account Evolution Tracking
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Track account growth and analyze posting patterns over time
            </p>
          </div>
          
          <div className="min-w-64">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="">Select an account</option>
              {trackedAccounts.map((account) => (
                <option key={account.id} value={account.username}>
                  @{account.username} ({account.total_tracked_tweets} tweets tracked)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 m-4">
          <p className="text-red-700">Error: {error}</p>
        </div>
      )}

      {loading && (
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading account evolution data...</p>
        </div>
      )}

      {selectedAccount && !loading && (
        <>
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-6 px-4">
              {[
                { id: 'overview', name: 'Overview', icon: '📊' },
                { id: 'evolution', name: 'Evolution', icon: '📈' },
                { id: 'comparison', name: 'Comparison', icon: '⚖️' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.icon} {tab.name}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-4">
            {/* Overview Tab */}
            {activeTab === 'overview' && performanceMetrics && (
              <div className="space-y-6">
                {/* Account Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center space-x-4">
                    {performanceMetrics.account.profile_image_url && (
                      <img
                        src={performanceMetrics.account.profile_image_url}
                        alt="Profile"
                        className="h-12 w-12 rounded-full"
                      />
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">
                        @{performanceMetrics.account.username}
                        {performanceMetrics.account.verified && (
                          <span className="ml-1 text-blue-500">✓</span>
                        )}
                      </h3>
                      <p className="text-gray-600">{performanceMetrics.account.display_name}</p>
                    </div>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatNumber(performanceMetrics.account.followers_count)}
                    </div>
                    <div className="text-sm text-gray-600">Followers</div>
                    {performanceMetrics.metrics.follower_growth !== 0 && (
                      <div className={`text-xs ${getChangeColor(performanceMetrics.metrics.follower_growth)}`}>
                        {formatPercentage(performanceMetrics.metrics.follower_growth_percent)} 
                        ({performanceMetrics.metrics.follower_growth > 0 ? '+' : ''}
                        {performanceMetrics.metrics.follower_growth})
                      </div>
                    )}
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {performanceMetrics.metrics.total_tweets}
                    </div>
                    <div className="text-sm text-gray-600">Tweets Tracked</div>
                    <div className="text-xs text-gray-500">
                      {performanceMetrics.metrics.posting_frequency} per day
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatNumber(performanceMetrics.metrics.total_engagement)}
                    </div>
                    <div className="text-sm text-gray-600">Total Engagement</div>
                    <div className="text-xs text-gray-500">
                      {(performanceMetrics.metrics.avg_engagement_rate * 100).toFixed(2)}% rate
                    </div>
                  </div>

                  <div className="bg-orange-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-orange-600">
                      {formatNumber(performanceMetrics.metrics.best_performing_tweet.total_engagement)}
                    </div>
                    <div className="text-sm text-gray-600">Best Tweet</div>
                    <div className="text-xs text-gray-500">
                      {(performanceMetrics.metrics.best_performing_tweet.engagement_rate * 100).toFixed(2)}% rate
                    </div>
                  </div>
                </div>

                {/* Sentiment Distribution */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Sentiment Distribution</h4>
                  <div className="flex space-x-4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                      <span className="text-sm">
                        Positive: {performanceMetrics.metrics.sentiment_distribution.positive}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-gray-500 rounded-full mr-2"></div>
                      <span className="text-sm">
                        Neutral: {performanceMetrics.metrics.sentiment_distribution.neutral}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                      <span className="text-sm">
                        Negative: {performanceMetrics.metrics.sentiment_distribution.negative}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Evolution Tab */}
            {activeTab === 'evolution' && evolutionData && (
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Daily Evolution (Last 30 Days)</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Followers</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Growth</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tweets</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Engagement</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sentiment</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {evolutionData.map((day, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {new Date(day.date_period).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {formatNumber(day.followers_count)}
                          </td>
                          <td className={`px-4 py-2 text-sm ${getChangeColor(day.follower_growth)}`}>
                            {day.follower_growth > 0 ? '+' : ''}{day.follower_growth}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {day.tweets_count}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {formatNumber(day.total_engagement)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {(parseFloat(day.avg_engagement_rate) * 100).toFixed(2)}%
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              day.dominant_sentiment === 'positive' ? 'bg-green-100 text-green-800' :
                              day.dominant_sentiment === 'negative' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {day.dominant_sentiment}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Comparison Tab */}
            {activeTab === 'comparison' && periodComparison && (
              <div className="space-y-6">
                <h4 className="font-medium text-gray-900">Period Comparison</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Current Period */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h5 className="font-medium text-blue-900 mb-3">
                      {periodComparison.current_period.period}
                    </h5>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-700">Tweets:</span>
                        <span className="text-sm font-medium text-blue-900">
                          {periodComparison.current_period.total_tweets}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-700">Engagement:</span>
                        <span className="text-sm font-medium text-blue-900">
                          {formatNumber(periodComparison.current_period.total_engagement)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-700">Avg Rate:</span>
                        <span className="text-sm font-medium text-blue-900">
                          {(parseFloat(periodComparison.current_period.avg_engagement_rate) * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Previous Period */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 mb-3">
                      {periodComparison.previous_period.period}
                    </h5>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-700">Tweets:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {periodComparison.previous_period.total_tweets}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-700">Engagement:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {formatNumber(periodComparison.previous_period.total_engagement)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-700">Avg Rate:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {(parseFloat(periodComparison.previous_period.avg_engagement_rate) * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Changes */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium text-gray-900 mb-3">Performance Changes</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className={`text-lg font-semibold ${getChangeColor(periodComparison.changes.tweets)}`}>
                        {formatPercentage(periodComparison.changes.tweets)}
                      </div>
                      <div className="text-xs text-gray-600">Tweets</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-semibold ${getChangeColor(periodComparison.changes.engagement)}`}>
                        {formatPercentage(periodComparison.changes.engagement)}
                      </div>
                      <div className="text-xs text-gray-600">Engagement</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-semibold ${getChangeColor(periodComparison.changes.engagement_rate)}`}>
                        {formatPercentage(periodComparison.changes.engagement_rate)}
                      </div>
                      <div className="text-xs text-gray-600">Eng. Rate</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-semibold ${getChangeColor(periodComparison.changes.posting_frequency)}`}>
                        {formatPercentage(periodComparison.changes.posting_frequency)}
                      </div>
                      <div className="text-xs text-gray-600">Frequency</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 text-center">
                    <span className={`inline-flex px-3 py-1 text-sm rounded-full ${
                      periodComparison.trends.overall === 'very_positive' ? 'bg-green-100 text-green-800' :
                      periodComparison.trends.overall === 'positive' ? 'bg-blue-100 text-blue-800' :
                      periodComparison.trends.overall === 'mixed' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      Overall Trend: {periodComparison.trends.overall.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TwitterAccountEvolution;