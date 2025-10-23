import { useState, useEffect, useRef } from 'react';
import { callTwitterApi } from '../utils/apiConfig';

export default function TwitterSearch({ 
  onSearch, 
  loading, 
  searchHistory = [], 
  onLoadHistory,
  initialValues = null,
  showNewSearchButton = false,
  onNewSearch
}) {
  // Main form state - use initial values if available
  const [keyword, setKeyword] = useState(initialValues?.keyword || '');
  const [accountUsername, setAccountUsername] = useState(initialValues?.accountUsername || '');
  
  // Hashtag state - simplified approach
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [discoveredHashtags, setDiscoveredHashtags] = useState([]);
  const [selectedHashtags, setSelectedHashtags] = useState([]);
  const [manualHashtags, setManualHashtags] = useState(() => {
    if (initialValues?.hashtags && initialValues.hashtags.length > 0) {
      return initialValues.hashtags.map(h => h.replace(/^#/, ''));
    }
    return [''];
  });
  
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
  
  // Search options - use initial values if available
  const [language, setLanguage] = useState(initialValues?.language || '');
  const [languageInput, setLanguageInput] = useState(() => {
    if (initialValues?.language) {
      const lang = languageData.find(l => l.code === initialValues.language);
      return lang?.name || initialValues.language;
    }
    return '';
  });
  const [showLanguageSuggestions, setShowLanguageSuggestions] = useState(false);
  const [languageSuggestions, setLanguageSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const languageInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const [sortOrder, setSortOrder] = useState(initialValues?.sortOrder || 'recent');
  const [limit, setLimit] = useState(initialValues?.limit || 25);
  const [includeMentions, setIncludeMentions] = useState(initialValues?.includeMentions || false);
  const [global, setGlobal] = useState(initialValues?.global || false);
  
  // UI state
  const [errors, setErrors] = useState({});
  
  // Update form when initialValues change (for history auto-fill)
  useEffect(() => {
    if (initialValues) {
      setKeyword(initialValues.keyword || '');
      setAccountUsername(initialValues.accountUsername || '');
      setLanguage(initialValues.language || '');
      
      // Update language input display
      if (initialValues.language) {
        const lang = languageData.find(l => l.code === initialValues.language);
        setLanguageInput(lang?.name || initialValues.language);
      } else {
        setLanguageInput('');
      }
      
      setSortOrder(initialValues.sortOrder || 'recent');
      setLimit(initialValues.limit || 25);
      setIncludeMentions(initialValues.includeMentions || false);
      setGlobal(initialValues.global || false);
      
      // Handle hashtags
      if (initialValues.hashtags && initialValues.hashtags.length > 0) {
        const cleanHashtags = initialValues.hashtags.map(h => h.replace(/^#/, ''));
        setManualHashtags([...cleanHashtags, '']); // Add empty input for new hashtag
        
        // If this was from auto-discovery, set up auto mode
        if (initialValues.hashtagMode === 'auto' && initialValues.discoveredHashtags) {
          setIsAutoMode(true);
          setDiscoveredHashtags(initialValues.discoveredHashtags);
          setSelectedHashtags(initialValues.discoveredHashtags);
          setDiscoveryComplete(true);
        } else {
          setIsAutoMode(false);
        }
      } else {
        setManualHashtags(['']);
        setIsAutoMode(false);
      }
      
      // Clear any previous errors
      setErrors({});
    }
  }, [initialValues]);
  
  // Hashtag discovery API call
  const discoverHashtags = async (searchKeyword) => {
    if (!searchKeyword?.trim()) return;
    
    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveryComplete(false);
    
    try {
      // Call hashtag discovery API with language parameter
      const response = await callTwitterApi({
        action: 'discover-hashtags',
        keyword: searchKeyword.trim(),
        language: language || undefined // Pass current language selection
      });
      
      if (response.success && response.hashtags && response.hashtags.length > 0) {
        setDiscoveredHashtags(response.hashtags);
        setSelectedHashtags(response.hashtags); // Auto-select all by default
        setDiscoveryComplete(true);
      } else if (response.message) {
        // Use the specific message from backend
        throw new Error(response.message);
      } else {
        throw new Error('Failed to discover hashtags');
      }
    } catch (error) {
      console.error('Hashtag discovery error:', error);
      // Use the error message from backend or default message
      const errorMessage = error.message || 'Failed to discover hashtags. Please try manual mode.';
      setDiscoveryError(errorMessage);
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


  // Check if form can be submitted
  const canSubmitSearch = () => {
    const hasKeyword = keyword.trim().length > 0;
    const hasAccount = accountUsername.trim().length > 0;
    const hasHashtags = !isAutoMode 
      ? manualHashtags.some(h => h.trim())
      : selectedHashtags.length > 0;
    
    const hasInput = hasKeyword || hasAccount || hasHashtags;
    
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
    const hasAccount = accountUsername.trim().length > 0;
    const finalHashtags = !isAutoMode 
      ? manualHashtags.filter(h => h.trim()).map(h => {
          const cleanTag = h.trim().replace(/^#/, '');
          return `#${cleanTag}`;
        })
      : selectedHashtags;
    
    const hasHashtags = finalHashtags.length > 0;
    
    // Use new separated search for all searches
    let searchType = 'separated-search';
    
    // Build search data
    const searchData = {
      action: searchType,  // Using new separated search
      keyword: hasKeyword ? keyword.trim() : '',
      accountUsername: hasAccount ? accountUsername.trim().replace(/^@/, '') : '',
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
      {/* Step 0: Account Username (Optional) */}
      <div className="form-group">
        <label htmlFor="accountUsername" style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          paddingLeft: '4px',
          borderLeft: '3px solid #1DA1F2'
        }}>0. Analyze Specific Account (Optional)</label>
        <input
          type="text"
          id="accountUsername"
          value={accountUsername}
          onChange={(e) => {
            const value = e.target.value;
            // Basic validation: only allow alphanumeric, underscore, and @ at the start
            if (value === '' || /^@?[a-zA-Z0-9_]*$/.test(value)) {
              setAccountUsername(value);
              // Clear error if valid
              if (errors.accountUsername) {
                setErrors(prev => ({ ...prev, accountUsername: null }));
              }
            }
          }}
          placeholder="Enter Twitter username (e.g., @elonmusk or elonmusk)"
          disabled={loading || isDiscovering}
        />
        <small style={{ color: '#666', fontSize: '12px' }}>
          Analyze tweets from a specific account. Can be combined with keywords/hashtags for filtered analysis.
        </small>
        {errors.accountUsername && (
          <small style={{ color: '#f00' }}>{errors.accountUsername}</small>
        )}
      </div>

      {/* Step 1: Keyword Input */}
      <div className="form-group">
        <label htmlFor="keyword" style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          paddingLeft: '4px',
          borderLeft: '3px solid #1DA1F2'
        }}>1. Keyword (Optional)</label>
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
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          paddingLeft: '4px',
          borderLeft: '3px solid #1DA1F2'
        }}>2. Hashtags (Optional)</label>
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
        <label htmlFor="language" style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          paddingLeft: '4px',
          borderLeft: '3px solid #1DA1F2'
        }}>3. Language Filter (Optional)</label>
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
              color: '#333',
              fontWeight: '400',
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
        <label htmlFor="sortOrder" style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          paddingLeft: '4px',
          borderLeft: '3px solid #1DA1F2'
        }}>4. Sort Order</label>
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
        <label htmlFor="limit" style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          paddingLeft: '4px',
          borderLeft: '3px solid #1DA1F2'
        }}>5. Results & Options</label>
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
            <option value={75}>75 tweets</option>
            <option value={100}>100 tweets</option>
            <option value={150}>150 tweets</option>
            <option value={200}>200 tweets</option>
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
              borderRadius: '2px',
              marginLeft: '8px'
            }}
          />
          <label 
            htmlFor="mentions"
            style={{ 
              fontSize: '14px',
              color: '#333',
              fontWeight: '400',
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

      {/* Search Buttons */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
        
        {showNewSearchButton && (
          <button
            type="button"
            onClick={onNewSearch}
            style={{
              background: '#fff',
              color: '#1DA1F2',
              border: '1px solid #1DA1F2',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#1DA1F2';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.color = '#1DA1F2';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
            </svg>
            New Search
          </button>
        )}
      </div>
    </form>
  );
}