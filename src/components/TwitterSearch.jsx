import { useState, useEffect, useRef } from 'react';
import { callTwitterApi } from '../utils/apiConfig';

export default function TwitterSearch({ 
  onSearch, 
  loading, 
  searchHistory = [], 
  onLoadHistory 
}) {
  // Main form state
  const [keyword, setKeyword] = useState('');
  
  // Hashtag state - simplified approach
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [discoveredHashtags, setDiscoveredHashtags] = useState([]);
  const [selectedHashtags, setSelectedHashtags] = useState([]);
  const [manualHashtags, setManualHashtags] = useState(['']);
  
  // Discovery state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [discoveryComplete, setDiscoveryComplete] = useState(false);
  
  // Language autocomplete data
  const languageData = [
    { code: 'en', name: 'English', variations: ['english', 'eng', 'inglés', 'anglais', 'englisch'] },
    { code: 'tr', name: 'Turkish', variations: ['turkish', 'türkçe', 'türkisch', 'turc', 'turco', 'turkce'] },
    { code: 'es', name: 'Spanish', variations: ['spanish', 'español', 'espanhol', 'espagnol', 'spanisch'] },
    { code: 'ar', name: 'Arabic', variations: ['arabic', 'عربي', 'árabe', 'arabe', 'arabisch', 'arapça'] },
    { code: 'fr', name: 'French', variations: ['french', 'français', 'francés', 'francese', 'französisch'] },
    { code: 'de', name: 'German', variations: ['german', 'deutsch', 'alemán', 'allemand', 'tedesco', 'almanca'] },
    { code: 'pt', name: 'Portuguese', variations: ['portuguese', 'português', 'portugais', 'portugiesisch', 'portekizce'] },
    { code: 'it', name: 'Italian', variations: ['italian', 'italiano', 'italien', 'italienisch', 'italyanca'] },
    { code: 'ja', name: 'Japanese', variations: ['japanese', '日本語', 'japonés', 'japonais', 'japanisch', 'japonca'] },
    { code: 'zh', name: 'Chinese', variations: ['chinese', '中文', 'chino', 'chinois', 'chinesisch', 'çince', 'mandarin'] },
    { code: 'ru', name: 'Russian', variations: ['russian', 'русский', 'ruso', 'russe', 'russisch', 'rusça'] },
    { code: 'hi', name: 'Hindi', variations: ['hindi', 'हिंदी', 'hintçe', 'hindou', 'hindisch'] },
    { code: 'ko', name: 'Korean', variations: ['korean', '한국어', 'coreano', 'coréen', 'koreanisch', 'korece'] },
    { code: 'nl', name: 'Dutch', variations: ['dutch', 'nederlands', 'holandés', 'néerlandais', 'holländisch', 'felemenkçe'] },
    { code: 'pl', name: 'Polish', variations: ['polish', 'polski', 'polaco', 'polonais', 'polnisch', 'lehçe'] }
  ];
  
  // Search options
  const [language, setLanguage] = useState('');
  const [languageInput, setLanguageInput] = useState('');
  const [showLanguageSuggestions, setShowLanguageSuggestions] = useState(false);
  const [languageSuggestions, setLanguageSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const languageInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const [sortOrder, setSortOrder] = useState('recent');
  const [limit, setLimit] = useState(25);
  const [includeMentions, setIncludeMentions] = useState(false);
  const [global, setGlobal] = useState(false);
  
  // UI state
  const [showHistory, setShowHistory] = useState(false);
  const [errors, setErrors] = useState({});
  
  // Hashtag discovery API call
  const discoverHashtags = async (searchKeyword) => {
    if (!searchKeyword?.trim()) return;
    
    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveryComplete(false);
    
    try {
      // Call hashtag discovery API
      const response = await callTwitterApi({
        action: 'discover-hashtags',
        keyword: searchKeyword.trim()
      });
      
      if (response.success && response.hashtags) {
        setDiscoveredHashtags(response.hashtags);
        setSelectedHashtags(response.hashtags); // Auto-select all by default
        setDiscoveryComplete(true);
      } else {
        throw new Error('Failed to discover hashtags');
      }
    } catch (error) {
      console.error('Hashtag discovery error:', error);
      setDiscoveryError('Failed to discover hashtags. Please try manual mode.');
      setDiscoveredHashtags([]);
      setSelectedHashtags([]);
    } finally {
      setIsDiscovering(false);
    }
  };
  
  // Handle auto-discovery toggle
  const handleAutoDiscoverToggle = async () => {
    if (!isAutoMode && !keyword.trim()) {
      // Show alert instead of disabling button
      alert('Please enter a keyword first to auto-discover hashtags');
      return;
    }
    
    if (!isAutoMode) {
      // Turning on auto-discovery
      setIsAutoMode(true);
      setErrors({});
      await discoverHashtags(keyword);
    } else {
      // Turning off auto-discovery - return to manual mode
      setIsAutoMode(false);
      setDiscoveredHashtags([]);
      setSelectedHashtags([]);
      setDiscoveryError(null);
    }
  };

  // Validation functions
  const validateKeyword = (value) => {
    if (!value.trim()) {
      return 'Keyword is required';
    }
    if (value.length < 2) {
      return 'Keyword must be at least 2 characters';
    }
    if (value.length > 100) {
      return 'Keyword must be less than 100 characters';
    }
    return null;
  };

  const validateHashtags = (hashtagList) => {
    const nonEmptyHashtags = hashtagList.filter(h => h.trim());
    
    if (nonEmptyHashtags.length === 0) {
      return 'At least one hashtag is required';
    }
    
    if (nonEmptyHashtags.length > 10) {
      return 'Maximum 10 hashtags allowed';
    }
    
    for (const hashtag of nonEmptyHashtags) {
      const cleanTag = hashtag.trim().replace(/^#/, '');
      if (!/^[a-zA-Z0-9_]+$/.test(cleanTag)) {
        return `Invalid hashtag format: ${hashtag}`;
      }
      if (cleanTag.length < 1 || cleanTag.length > 100) {
        return `Hashtag length must be 1-100 characters: ${hashtag}`;
      }
    }
    
    return null;
  };

  // Check if form can be submitted
  const canSubmitSearch = () => {
    const hasKeyword = keyword.trim().length > 0;
    const hasHashtags = !isAutoMode 
      ? manualHashtags.some(h => h.trim())
      : selectedHashtags.length > 0;
    
    const hasInput = hasKeyword || hasHashtags;
    
    // For auto mode, must wait for discovery to complete
    const discoveryReady = !isAutoMode || (!isDiscovering && (discoveredHashtags.length > 0 || discoveryError));
    
    return hasInput && discoveryReady;
  };
  
  // Handle form submission
  const handleSearch = () => {
    setErrors({});
    
    if (!canSubmitSearch()) {
      setErrors({ form: 'Please complete the form before searching' });
      return;
    }
    
    // Determine what type of search to perform
    const hasKeyword = keyword.trim().length > 0;
    const finalHashtags = !isAutoMode 
      ? manualHashtags.filter(h => h.trim()).map(h => {
          const cleanTag = h.trim().replace(/^#/, '');
          return `#${cleanTag}`;
        })
      : selectedHashtags;
    
    const hasHashtags = finalHashtags.length > 0;
    
    // Build search data
    const searchData = {
      type: 'combined-search',
      keyword: hasKeyword ? keyword.trim() : '',
      hashtags: hasHashtags ? finalHashtags : [],
      language: language.trim() || null,
      sortOrder,
      includeMentions,
      global,
      limit
    };
    
    onSearch(searchData);
  };

  // Manual hashtag management
  const addHashtagInput = () => {
    if (manualHashtags.length < 10) {
      setManualHashtags([...manualHashtags, '']);
    }
  };

  const removeHashtagInput = (index) => {
    if (manualHashtags.length > 1) {
      setManualHashtags(manualHashtags.filter((_, i) => i !== index));
    }
  };

  const updateHashtag = (index, value) => {
    const newHashtags = [...manualHashtags];
    newHashtags[index] = value;
    setManualHashtags(newHashtags);
  };
  
  // Auto-discovered hashtag management
  const toggleHashtagSelection = (hashtag) => {
    setSelectedHashtags(prev => 
      prev.includes(hashtag)
        ? prev.filter(h => h !== hashtag)
        : [...prev, hashtag]
    );
  };
  
  // Language search functionality
  const searchLanguages = (input) => {
    if (!input || input.trim().length < 1) {
      setLanguageSuggestions([]);
      setShowLanguageSuggestions(false);
      return;
    }
    
    const searchTerm = input.toLowerCase().trim();
    const matches = [];
    
    // Search through all languages and their variations
    languageData.forEach(lang => {
      // Check main name
      if (lang.name.toLowerCase().includes(searchTerm)) {
        if (!matches.find(m => m.code === lang.code)) {
          matches.push({ ...lang, matchType: 'name' });
        }
      }
      // Check code
      else if (lang.code.toLowerCase().includes(searchTerm)) {
        if (!matches.find(m => m.code === lang.code)) {
          matches.push({ ...lang, matchType: 'code' });
        }
      }
      // Check variations
      else {
        lang.variations.forEach(variation => {
          if (variation.toLowerCase().includes(searchTerm)) {
            if (!matches.find(m => m.code === lang.code)) {
              matches.push({ ...lang, matchType: 'variation', matchedVariation: variation });
            }
          }
        });
      }
    });
    
    // Sort matches by relevance (exact matches first, then partial)
    matches.sort((a, b) => {
      const aExact = a.name.toLowerCase() === searchTerm || 
                     a.code === searchTerm || 
                     a.variations.some(v => v.toLowerCase() === searchTerm);
      const bExact = b.name.toLowerCase() === searchTerm || 
                     b.code === searchTerm || 
                     b.variations.some(v => v.toLowerCase() === searchTerm);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });
    
    setLanguageSuggestions(matches.slice(0, 6)); // Show max 6 suggestions
    setShowLanguageSuggestions(matches.length > 0);
    setSelectedSuggestionIndex(-1);
  };
  
  const handleLanguageInputChange = (e) => {
    const value = e.target.value;
    setLanguageInput(value);
    searchLanguages(value);
  };
  
  const selectLanguage = (lang) => {
    setLanguage(lang.code);
    setLanguageInput(lang.name);
    setShowLanguageSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };
  
  const handleLanguageKeyDown = (e) => {
    if (!showLanguageSuggestions) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < languageSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < languageSuggestions.length) {
        selectLanguage(languageSuggestions[selectedSuggestionIndex]);
      } else if (languageSuggestions.length > 0) {
        selectLanguage(languageSuggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setShowLanguageSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };
  
  // Clear language when global is enabled
  useEffect(() => {
    if (global) {
      setLanguage('');
      setLanguageInput('');
      setLanguageSuggestions([]);
      setShowLanguageSuggestions(false);
    }
  }, [global]);
  
  // Click outside handler for suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (languageInputRef.current && !languageInputRef.current.contains(event.target) &&
          suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowLanguageSuggestions(false);
        setSelectedSuggestionIndex(-1);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Trigger discovery when keyword changes in auto mode
  useEffect(() => {
    if (isAutoMode && keyword.trim() && keyword.trim().length > 2) {
      const timeoutId = setTimeout(() => {
        discoverHashtags(keyword);
      }, 500); // Debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [keyword, isAutoMode]);

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch();
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Step 1: Keyword Input */}
      <div className="form-group">
        <label htmlFor="keyword">1. Keyword (Optional)</label>
        <input
          type="text"
          id="keyword"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Enter keyword (e.g., artificial intelligence)"
          disabled={loading || isDiscovering}
        />
        <small style={{ color: '#666', fontSize: '12px' }}>
          Leave empty to search hashtags only
        </small>
        {errors.keyword && (
          <small style={{ color: '#f00' }}>{errors.keyword}</small>
        )}
      </div>

      {/* Step 2: Hashtags */}
      <div className="form-group">
        <label>2. Hashtags (Optional)</label>
        {errors.hashtag && (
          <small style={{ color: '#f00' }}>{errors.hashtag}</small>
        )}
      </div>

      {/* Auto-discovery Display */}
      {isAutoMode && (
        <div className="form-group">
          {isDiscovering && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              padding: '12px',
              background: '#f8f9fa',
              borderRadius: '4px',
              border: '1px solid #e5e5e5'
            }}>
              <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
              <span style={{ fontSize: '14px', color: '#666' }}>Discovering hashtags...</span>
            </div>
          )}
          
          {discoveryError && (
            <div style={{ 
              padding: '12px',
              background: '#fef2f2',
              borderRadius: '4px',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '14px'
            }}>
              {discoveryError}
            </div>
          )}
          
          {discoveryComplete && discoveredHashtags.length > 0 && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px' }}>Discovered Hashtags (click to toggle)</label>
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px',
                padding: '12px',
                background: '#f8f9fa',
                borderRadius: '4px',
                border: '1px solid #e5e5e5'
              }}>
                {discoveredHashtags.map((hashtag, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => toggleHashtagSelection(hashtag)}
                    disabled={loading}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      border: '1px solid #007bff',
                      background: selectedHashtags.includes(hashtag) ? '#007bff' : '#fff',
                      color: selectedHashtags.includes(hashtag) ? '#fff' : '#007bff',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {hashtag}
                  </button>
                ))}
              </div>
              <small style={{ color: '#666', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                {selectedHashtags.length} of {discoveredHashtags.length} hashtags selected
              </small>
            </div>
          )}
        </div>
      )}

      {/* Manual Hashtag Inputs */}
      {!isAutoMode && (
        <div className="form-group">
          {manualHashtags.map((hashtag, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={hashtag}
                onChange={(e) => updateHashtag(index, e.target.value)}
                placeholder={`#hashtag${index + 1}`}
                disabled={loading || isDiscovering}
                style={{ flex: 1 }}
              />
              {manualHashtags.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeHashtagInput(index)}
                  disabled={loading || isDiscovering}
                  style={{ 
                    padding: '8px 12px',
                    border: '1px solid #e5e5e5',
                    background: '#fff',
                    cursor: 'pointer',
                    borderRadius: '4px'
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          
          {/* Action buttons row */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {manualHashtags.length < 10 && (
              <button
                type="button"
                onClick={addHashtagInput}
                disabled={loading || isDiscovering}
                className="secondary-btn"
              >
                Add Hashtag
              </button>
            )}
            
            <button
              type="button"
              onClick={handleAutoDiscoverToggle}
              disabled={loading || isDiscovering}
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                background: '#f8f9fa',
                color: '#007bff',
                border: '1px solid #007bff',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ✨ Auto-discover from keyword
            </button>
          </div>
          
          <small style={{ color: '#666', fontSize: '12px', display: 'block', marginTop: '8px' }}>
            Leave empty to search keyword only
          </small>
          
          {errors.hashtags && (
            <small style={{ color: '#f00' }}>{errors.hashtags}</small>
          )}
        </div>
      )}

      {/* Auto-discovery active state */}
      {isAutoMode && (
        <div className="form-group">
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleAutoDiscoverToggle}
              disabled={loading || isDiscovering}
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                background: '#007bff',
                color: '#fff',
                border: '1px solid #007bff',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ✨ Auto-discover active
            </button>
            <small style={{ color: '#666', fontSize: '12px' }}>
              Click to return to manual hashtags
            </small>
          </div>
        </div>
      )}

      {/* Step 3: Language Filter */}
      <div className="form-group" style={{ position: 'relative' }}>
        <label htmlFor="language">3. Language Filter (Optional)</label>
        <input
          ref={languageInputRef}
          type="text"
          id="language"
          value={languageInput}
          onChange={handleLanguageInputChange}
          onKeyDown={handleLanguageKeyDown}
          onFocus={() => languageInput && searchLanguages(languageInput)}
          placeholder="Type to search languages (e.g., Turkish, türkçe, tr...)"
          disabled={loading || isDiscovering || global}
          autoComplete="off"
        />
        {language && (
          <div style={{
            fontSize: '12px',
            color: '#007bff',
            marginTop: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>Selected: <strong>{language}</strong></span>
            {!global && (
              <button
                type="button"
                onClick={() => {
                  setLanguage('');
                  setLanguageInput('');
                  setLanguageSuggestions([]);
                }}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  background: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  color: '#6c757d'
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}
        
        {/* Language Suggestions Dropdown */}
        {showLanguageSuggestions && languageSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '2px',
              background: '#fff',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              zIndex: 1000,
              maxHeight: '250px',
              overflowY: 'auto'
            }}
          >
            {languageSuggestions.map((lang, index) => (
              <div
                key={lang.code}
                onClick={() => selectLanguage(lang)}
                onMouseEnter={() => setSelectedSuggestionIndex(index)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderBottom: index < languageSuggestions.length - 1 ? '1px solid #f1f3f4' : 'none',
                  background: selectedSuggestionIndex === index ? '#f8f9fa' : 'transparent',
                  transition: 'background 0.15s ease',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: '500',
                    color: '#212529',
                    fontSize: '14px'
                  }}>
                    {lang.name}
                  </div>
                  {lang.matchType === 'variation' && lang.matchedVariation && (
                    <div style={{
                      fontSize: '12px',
                      color: '#6c757d',
                      marginTop: '2px'
                    }}>
                      matched: "{lang.matchedVariation}"
                    </div>
                  )}
                </div>
                <div style={{
                  background: '#007bff',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  fontWeight: '600',
                  marginLeft: '8px'
                }}>
                  {lang.code}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          marginTop: '8px'
        }}>
          <input
            type="checkbox"
            id="global"
            checked={global}
            onChange={(e) => {
              setGlobal(e.target.checked);
              if (e.target.checked) {
                setLanguage('');
                setLanguageInput('');
              }
            }}
            disabled={loading || isDiscovering}
            style={{ 
              margin: 0,
              width: 'auto',
              padding: 0
            }}
          />
          <label 
            htmlFor="global"
            style={{ 
              fontSize: '13px',
              color: '#000',
              margin: 0,
              cursor: 'pointer'
            }}
          >
            Global search (all languages)
          </label>
        </div>
        <small style={{ color: '#666', fontSize: '12px' }}>
          {global ? 'Searching worldwide in all languages' : 'Select a language to filter tweets by language, or leave default for English'}
        </small>
      </div>

      {/* Step 5: Sort Options */}
      <div className="form-group">
        <label htmlFor="sortOrder">4. Sort Order</label>
        <select
          id="sortOrder"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          disabled={loading || isDiscovering}
          className="form-select"
        >
          <option value="recent">Recent (newest first)</option>
          <option value="popular">Popular (by engagement)</option>
        </select>
      </div>

      {/* Step 6: Final Options */}
      <div className="form-group">
        <label htmlFor="limit">5. Results & Options</label>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '8px' }}>
          <select
            id="limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={loading || isDiscovering}
            className="form-select"
            style={{ flex: '0 0 auto', width: '120px' }}
          >
            <option value={10}>10 tweets</option>
            <option value={25}>25 tweets</option>
            <option value={50}>50 tweets</option>
            <option value={100}>100 tweets</option>
          </select>
        </div>
      </div>


      <div className="form-group">
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          marginBottom: '15px'
        }}>
          <input
            type="checkbox"
            id="mentions"
            checked={includeMentions}
            onChange={(e) => setIncludeMentions(e.target.checked)}
            disabled={loading || isDiscovering}
            style={{ 
              margin: 0,
              width: 'auto',
              padding: 0,
              border: '1px solid #e5e5e5',
              borderRadius: '2px'
            }}
          />
          <label 
            htmlFor="mentions"
            style={{ 
              fontSize: '14px',
              color: '#000',
              fontWeight: '300',
              textTransform: 'none',
              letterSpacing: '0',
              margin: 0,
              cursor: 'pointer'
            }}
          >
            Include mentions and replies
          </label>
        </div>
        <small style={{ color: '#666', fontSize: '11px', marginTop: '4px', display: 'block' }}>
          💡 Recommended: Including mentions enriches analysis with deeper conversation insights
        </small>
        
        {errors.form && (
          <small style={{ color: '#f00', display: 'block', marginBottom: '10px' }}>{errors.form}</small>
        )}
      </div>

      {/* Search Button */}
      <button
        type="submit"
        disabled={!canSubmitSearch() || loading}
        style={{
          opacity: !canSubmitSearch() || loading ? 0.6 : 1,
          cursor: !canSubmitSearch() || loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Analyzing...' : 
         isDiscovering ? 'Discovering hashtags...' :
         !canSubmitSearch() ? 'Complete form to search' :
         'Start Analysis'}
      </button>
    </form>
  );
}