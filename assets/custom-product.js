/**
 * custom-product.js
 * Handles: Pack Size Cards variant selection + Subscription Widget + Video Popup
 */

(function () {
  'use strict';

  function formatMoney(cents) {
    var fmt = (window.Shopify && window.Shopify.money_format) || '${{amount}}';
    var amount = (Number(cents || 0) / 100).toFixed(2);

    return fmt
      .replace(/\{\{\s*amount\s*\}\}/g, amount)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, Math.round(Number(cents || 0) / 100))
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, amount.replace('.', ','));
  }

  // ─── Pack Size Cards ──────────────────────────────────────────────────────

  function initPackSizeCards() {
    var cards = document.querySelectorAll('.pp-pack-card');
    if (!cards.length) return;

    cards.forEach(function (card) {
      if (card.dataset.ppPackBound === 'true') return;
      card.dataset.ppPackBound = 'true';

      card.addEventListener('click', function () {
        var optionValue = this.dataset.optionValue;
        var matched = false;

        document.querySelectorAll('.pp-hidden-option input[type="radio"]').forEach(function (input) {
          if (!matched && input.value === optionValue) {
            input.click();
            matched = true;
          }
        });

        document.querySelectorAll('.pp-pack-card').forEach(function (c) {
          c.classList.remove('is-selected');
        });

        this.classList.add('is-selected');
      });
    });

    var productInfo = document.querySelector('product-info');

    if (productInfo && productInfo.dataset.ppPackVariantBound !== 'true') {
      productInfo.dataset.ppPackVariantBound = 'true';

      productInfo.addEventListener('variant:changed', function (e) {
        updateCardsForVariant(e.detail && e.detail.variant);
      });
    }

    if (document.documentElement.dataset.ppPackDocVariantBound !== 'true') {
      document.documentElement.dataset.ppPackDocVariantBound = 'true';

      document.addEventListener('variant:changed', function (e) {
        updateCardsForVariant(e.detail && e.detail.variant);
      });
    }
  }

  function updateCardsForVariant(variant) {
    if (!variant) return;

    document.querySelectorAll('.pp-pack-card').forEach(function (card) {
      var optVal = card.dataset.optionValue;

      if (variant.options && variant.options.indexOf(optVal) !== -1) {
        var packSize = parseInt(card.dataset.packSize, 10) || 1;
        var priceEl = card.querySelector('.pp-pack-card__price');
        var perUnitEl = card.querySelector('.pp-pack-card__per-unit');

        if (priceEl) priceEl.textContent = formatMoney(variant.price);
        if (perUnitEl) perUnitEl.textContent = formatMoney(Math.round(variant.price / packSize)) + '/pouch';

        if (String(variant.id) === String(card.dataset.variantId)) {
          document.querySelectorAll('.pp-pack-card').forEach(function (c) {
            c.classList.remove('is-selected');
          });

          card.classList.add('is-selected');
        }
      }
    });
  }

  // ─── Subscription Widget ─────────────────────────────────────────────────

  function initSubscriptionWidget() {
    bindSubscriptionGlobalHandlers();
    bindSubscriptionMutationObserver();

    document.querySelectorAll('.pp-sub-widget').forEach(function (widget) {
      initSingleSubscriptionWidget(widget);
    });
  }

  function initSingleSubscriptionWidget(widget) {
    if (!widget) return;

    var sectionId = widget.dataset.sectionId;
    if (!sectionId) return;

    bindSubscriptionSubmitHandler(sectionId);

    var currentVariantId = getCurrentVariantId(sectionId);

    if (currentVariantId) {
      updateSubscriptionWidgetForVariant(sectionId, currentVariantId, true);
    } else {
      var checked = widget.querySelector('.pp-sub-type-radio:checked');
      setPurchaseType(widget, checked ? checked.value : 'subscribe');
    }

    forceSyncWidgetToForm(widget);
  }

  function bindSubscriptionGlobalHandlers() {
    if (window.__ppSubGlobalHandlersBound) return;
    window.__ppSubGlobalHandlersBound = true;

    document.addEventListener('change', function (e) {
      if (e.target.matches('.pp-sub-type-radio')) {
        var widget = e.target.closest('.pp-sub-widget');

        if (widget) {
          setPurchaseType(widget, e.target.value);
          forceSyncWidgetToForm(widget);
        }

        return;
      }

      if (e.target.matches('.pp-sub-delivery__select')) {
        var widgetForSelect = e.target.closest('.pp-sub-widget');

        if (widgetForSelect) {
          updateSubscriptionPriceForSelectedPlan(widgetForSelect);
          forceSyncWidgetToForm(widgetForSelect);
        }

        return;
      }

      if (e.target.name === 'id') {
        var form = e.target.closest('form');
        if (!form) return;

        var sectionId = getSectionIdFromForm(form);

        if (sectionId) {
          scheduleSubscriptionSync(sectionId, e.target.value);
        }
      }
    });

    document.addEventListener('click', function (e) {
      var option = e.target.closest('.pp-sub-option');
      if (!option) return;
      if (e.target.closest('select')) return;

      var radio = option.querySelector('.pp-sub-type-radio');

      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    document.addEventListener('variant:changed', function (e) {
      var variant = e.detail && e.detail.variant;
      var sectionId = e.detail && e.detail.sectionId;

      if (!variant) return;

      if (sectionId) {
        scheduleSubscriptionSync(sectionId, variant.id);
      } else {
        scheduleAllSubscriptionSync(variant.id);
      }
    });

    if (window.subscribe && window.PUB_SUB_EVENTS) {
      window.subscribe(window.PUB_SUB_EVENTS.variantChange, function (pubSubData) {
        var data = pubSubData && pubSubData.data;
        var variant = data && data.variant;
        var sectionId = data && data.sectionId;

        if (!variant) return;

        if (sectionId) {
          scheduleSubscriptionSync(sectionId, variant.id);
        } else {
          scheduleAllSubscriptionSync(variant.id);
        }
      });
    }
  }

  function bindSubscriptionMutationObserver() {
    if (window.__ppSubMutationObserverBound) return;
    window.__ppSubMutationObserverBound = true;

    var timer = null;

    var observer = new MutationObserver(function (mutations) {
      var shouldSync = false;

      mutations.forEach(function (mutation) {
        if (shouldSync) return;

        mutation.addedNodes.forEach(function (node) {
          if (shouldSync || node.nodeType !== 1) return;

          if (
            node.matches &&
            (
              node.matches('.pp-sub-widget') ||
              node.matches('form[action*="/cart/add"]') ||
              node.matches('input[name="selling_plan"]') ||
              node.matches('input[name="id"]')
            )
          ) {
            shouldSync = true;
            return;
          }

          if (
            node.querySelector &&
            (
              node.querySelector('.pp-sub-widget') ||
              node.querySelector('form[action*="/cart/add"]') ||
              node.querySelector('input[name="selling_plan"]') ||
              node.querySelector('input[name="id"]')
            )
          ) {
            shouldSync = true;
          }
        });
      });

      if (!shouldSync) return;

      clearTimeout(timer);

      timer = setTimeout(function () {
        document.querySelectorAll('.pp-sub-widget').forEach(function (widget) {
          initSingleSubscriptionWidget(widget);
        });
      }, 50);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function scheduleSubscriptionSync(sectionId, variantId) {
    [0, 50, 150, 300].forEach(function (delay) {
      setTimeout(function () {
        var currentVariantId = getCurrentVariantId(sectionId) || variantId;
        var finalVariantId = variantId || currentVariantId;

        if (!finalVariantId) return;

        updateSubscriptionWidgetForVariant(sectionId, finalVariantId, false);

        var widget = getSubscriptionWidget(sectionId);
        if (widget) {
          forceSyncWidgetToForm(widget);
        }
      }, delay);
    });
  }

  function scheduleAllSubscriptionSync(variantId) {
    [0, 50, 150, 300].forEach(function (delay) {
      setTimeout(function () {
        document.querySelectorAll('.pp-sub-widget').forEach(function (widget) {
          var sectionId = widget.dataset.sectionId;
          if (!sectionId) return;

          var currentVariantId = getCurrentVariantId(sectionId);

          if (!variantId || String(currentVariantId) === String(variantId)) {
            updateSubscriptionWidgetForVariant(sectionId, currentVariantId || variantId, false);
            forceSyncWidgetToForm(widget);
          }
        });
      }, delay);
    });
  }

  function getSectionIdFromForm(form) {
    if (!form) return null;

    var formId = form.getAttribute('id');
    if (!formId) return null;

    var inputs = document.querySelectorAll('input[id^="pp-selling-plan-"]');

    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].getAttribute('form') === formId) {
        return inputs[i].id.replace('pp-selling-plan-', '');
      }
    }

    var sectionInput = form.querySelector('input[name="section-id"]');

    if (sectionInput && sectionInput.value) {
      return sectionInput.value;
    }

    var match = formId.match(/^product-form-(.+)$/);
    return match ? match[1] : null;
  }

  function getSubscriptionWidget(sectionId) {
    return document.getElementById('pp-sub-widget-' + sectionId);
  }

  function getSubData(sectionId) {
    var dataEl = document.getElementById('pp-sub-data-' + sectionId);
    if (!dataEl) return null;

    try {
      return JSON.parse(dataEl.textContent);
    } catch (error) {
      console.error('[pp-sub] JSON parse failed:', error);
      return null;
    }
  }

  function getProductFormForSection(sectionId) {
    var ppInput = document.getElementById('pp-selling-plan-' + sectionId);
    var formId = ppInput && ppInput.getAttribute('form');

    if (formId) {
      var formByAttr = document.getElementById(formId);

      if (formByAttr) {
        return formByAttr;
      }
    }

    var fallbackForm = document.getElementById('product-form-' + sectionId);

    if (fallbackForm) {
      return fallbackForm;
    }

    var formBySectionInput = document.querySelector(
      'form[action*="/cart/add"] input[name="section-id"][value="' + cssEscape(sectionId) + '"]'
    );

    if (formBySectionInput) {
      return formBySectionInput.closest('form');
    }

    return null;
  }

  function getCurrentVariantId(sectionId) {
    var form = getProductFormForSection(sectionId);

    if (form) {
      var formVariantInput = form.querySelector('input[name="id"], select[name="id"]');

      if (formVariantInput) {
        return formVariantInput.value;
      }
    }

    return null;
  }

  function getVariantData(sectionId, variantId) {
    var subData = getSubData(sectionId);
    if (!subData || !subData.variants) return null;

    return subData.variants[String(variantId)] || null;
  }

  function setPurchaseType(widget, type) {
    if (!widget) return;

    var subscribeOption = widget.querySelector('.pp-sub-option--subscribe');
    var onetimeOption = widget.querySelector('.pp-sub-option--onetime');
    var subscribeRadio = widget.querySelector('.pp-sub-type-radio[value="subscribe"]');
    var onetimeRadio = widget.querySelector('.pp-sub-type-radio[value="onetime"]');

    var isSubscription = type === 'subscribe';

    if (subscribeOption) {
      subscribeOption.classList.toggle('is-selected', isSubscription);
    }

    if (onetimeOption) {
      onetimeOption.classList.toggle('is-selected', !isSubscription);
    }

    if (subscribeRadio) {
      subscribeRadio.checked = isSubscription;
    }

    if (onetimeRadio) {
      onetimeRadio.checked = !isSubscription;
    }

    syncSellingPlanInput(widget);
  }

  function getSelectedPlanId(widget) {
    if (!widget) return '';

    var checkedRadio = widget.querySelector('.pp-sub-type-radio:checked');
    var select = widget.querySelector('.pp-sub-delivery__select');
    var isSubscription = checkedRadio && checkedRadio.value === 'subscribe';

    if (!isSubscription || !select || !select.value || String(select.value) === '0') {
      return '';
    }

    return String(select.value);
  }

  function syncSellingPlanInput(widget) {
    if (!widget) return;

    var sectionId = widget.dataset.sectionId;
    var planId = getSelectedPlanId(widget);
    var form = getProductFormForSection(sectionId);
    var ppInput = document.getElementById('pp-selling-plan-' + sectionId);

    if (ppInput) {
      ppInput.value = planId;
      ppInput.disabled = !planId;
    }

    if (form) {
      form.querySelectorAll('input[name="selling_plan"]').forEach(function (input) {
        input.value = planId;
        input.disabled = !planId;
      });
    }

    var customInput = document.getElementById('selling-plan-input');

    if (customInput) {
      customInput.value = planId;
      customInput.disabled = !planId;
    }
  }

  function forceSyncWidgetToForm(widget) {
    if (!widget) return;

    var sectionId = widget.dataset.sectionId;
    var form = getProductFormForSection(sectionId);
    var select = widget.querySelector('.pp-sub-delivery__select');
    var subscribeRadio = widget.querySelector('.pp-sub-type-radio[value="subscribe"]');
    var checkedRadio = widget.querySelector('.pp-sub-type-radio:checked');

    if (widget.style.display === 'none') {
      clearSellingPlanInput(sectionId);
      return;
    }

    if (select && select.options.length && (!select.value || String(select.value) === '0')) {
      select.selectedIndex = 0;
    }

    if (subscribeRadio && (!checkedRadio || checkedRadio.value !== 'onetime')) {
      setPurchaseType(widget, 'subscribe');
    }

    var planId = getSelectedPlanId(widget);

    if (!planId && select && select.options.length) {
      planId = String(select.options[select.selectedIndex >= 0 ? select.selectedIndex : 0].value || '');

      if (planId && planId !== '0') {
        select.value = planId;

        if (subscribeRadio) {
          setPurchaseType(widget, 'subscribe');
        }
      }
    }

    var ppInput = document.getElementById('pp-selling-plan-' + sectionId);

    if (ppInput) {
      ppInput.value = planId && planId !== '0' ? planId : '';
      ppInput.disabled = !(planId && planId !== '0');
    }

    if (form) {
      form.querySelectorAll('input[name="selling_plan"]').forEach(function (input) {
        input.value = planId && planId !== '0' ? planId : '';
        input.disabled = !(planId && planId !== '0');
      });
    }

    var customInput = document.getElementById('selling-plan-input');

    if (customInput) {
      customInput.value = planId && planId !== '0' ? planId : '';
      customInput.disabled = !(planId && planId !== '0');
    }
  }

  function rebuildPlanDropdown(widget, allocations) {
    var select = widget && widget.querySelector('.pp-sub-delivery__select');
    if (!select) return;

    var previousValue = select.value;
    select.innerHTML = '';

    allocations.forEach(function (allocation, index) {
      var sellingPlanId = allocation.selling_plan_id;

      if (!sellingPlanId || String(sellingPlanId) === '0') {
        return;
      }

      var option = document.createElement('option');

      option.value = String(sellingPlanId);
      option.textContent = allocation.name || allocation.selling_plan_name || 'Subscription plan ' + (index + 1);

      if (String(sellingPlanId) === String(previousValue)) {
        option.selected = true;
      }

      select.appendChild(option);
    });

    if ((!select.value || String(select.value) === '0') && select.options.length) {
      select.selectedIndex = 0;
    }
  }

  function getSelectedAllocation(widget, variantData) {
    if (!widget || !variantData || !variantData.allocations || !variantData.allocations.length) {
      return null;
    }

    var select = widget.querySelector('.pp-sub-delivery__select');
    var selectedPlanId = select ? String(select.value) : null;
    var selectedAllocation = null;

    variantData.allocations.forEach(function (allocation) {
      if (!selectedAllocation && allocation.selling_plan_id && String(allocation.selling_plan_id) !== '0') {
        selectedAllocation = allocation;
      }

      if (selectedPlanId && String(allocation.selling_plan_id) === selectedPlanId) {
        selectedAllocation = allocation;
      }
    });

    return selectedAllocation;
  }

  function updateSubscriptionPriceForSelectedPlan(widget) {
    if (!widget) return;

    var sectionId = widget.dataset.sectionId;
    var variantId = getCurrentVariantId(sectionId);
    var variantData = getVariantData(sectionId, variantId);

    if (!variantData) {
      forceSyncWidgetToForm(widget);
      return;
    }

    var allocation = getSelectedAllocation(widget, variantData);

    if (allocation) {
      updateSubscriptionPrices(widget, variantData, allocation);
    }

    syncSellingPlanInput(widget);
  }

  function clearSellingPlanInput(sectionId) {
    var ppInput = document.getElementById('pp-selling-plan-' + sectionId);

    if (ppInput) {
      ppInput.disabled = true;
      ppInput.value = '';
    }

    var form = getProductFormForSection(sectionId);

    if (form) {
      form.querySelectorAll('input[name="selling_plan"]').forEach(function (input) {
        input.disabled = true;
        input.value = '';
      });
    }

    var customInput = document.getElementById('selling-plan-input');

    if (customInput) {
      customInput.disabled = true;
      customInput.value = '';
    }
  }

  function updateSubscriptionWidgetForVariant(sectionId, variantId, isInitialLoad) {
    var widget = getSubscriptionWidget(sectionId);
    var variantData = getVariantData(sectionId, variantId);

    if (!widget) return;

    if (!variantData) {
      widget.style.display = 'none';
      clearSellingPlanInput(sectionId);
      return;
    }

    var allocations = (variantData.allocations || []).filter(function (allocation) {
      return allocation.selling_plan_id && String(allocation.selling_plan_id) !== '0';
    });

    var hasSubscription = allocations.length > 0;

    widget.style.display = hasSubscription ? '' : 'none';

    if (!hasSubscription) {
      clearSellingPlanInput(sectionId);
      return;
    }

    rebuildPlanDropdown(widget, allocations);

    var allocation = getSelectedAllocation(widget, {
      price: variantData.price,
      pack_size: variantData.pack_size,
      allocations: allocations
    }) || allocations[0];

    updateSubscriptionPrices(widget, variantData, allocation);

    var checkedRadio = widget.querySelector('.pp-sub-type-radio:checked');
    var currentPurchaseType = checkedRadio ? checkedRadio.value : null;

    if (isInitialLoad || !currentPurchaseType || currentPurchaseType !== 'onetime') {
      setPurchaseType(widget, 'subscribe');
    } else {
      setPurchaseType(widget, currentPurchaseType);
    }

    forceSyncWidgetToForm(widget);
  }

  function updateSubscriptionPrices(widget, variantData, allocation) {
    if (!widget || !variantData || !allocation) return;

    var packSize = parseInt(variantData.pack_size, 10) || 1;

    var subPriceEl = widget.querySelector('.pp-sub-subscribe-price');
    var subPerUnitEl = widget.querySelector('.pp-sub-subscribe-per-unit');
    var onetimePriceEl = widget.querySelector('.pp-sub-onetime-price');
    var onetimePerUnitEl = widget.querySelector('.pp-sub-onetime-per-unit');
    var savingsBanner = widget.querySelector('.pp-sub-savings-banner');
    var savingsText = widget.querySelector('.pp-sub-savings-banner__text');
    var comparePriceEl = widget.querySelector('.pp-sub-option__price-compare');

    if (subPriceEl) {
      subPriceEl.textContent = formatMoney(allocation.price);
    }

    if (subPerUnitEl) {
      subPerUnitEl.textContent = formatMoney(Math.round(allocation.price / packSize)) + '/pouch';
    }

    if (onetimePriceEl) {
      onetimePriceEl.textContent = formatMoney(variantData.price);
    }

    if (onetimePerUnitEl) {
      onetimePerUnitEl.textContent = formatMoney(Math.round(variantData.price / packSize)) + '/pouch';
    }

    var compareAtPrice = allocation.compare_at_price || variantData.price;
    var savings = compareAtPrice - allocation.price;

    if (comparePriceEl) {
      if (compareAtPrice > allocation.price) {
        comparePriceEl.textContent = formatMoney(compareAtPrice);
        comparePriceEl.style.display = '';
      } else {
        comparePriceEl.style.display = 'none';
      }
    }

    if (savingsBanner) {
      if (savings > 0) {
        var pct = Math.round((savings * 100) / compareAtPrice);

        if (savingsText) {
          savingsText.textContent = 'Save ' + pct + '% (' + formatMoney(savings) + ' off)';
        }

        savingsBanner.style.display = '';
      } else {
        savingsBanner.style.display = 'none';
      }
    }
  }

  function bindSubscriptionSubmitHandler(sectionId) {
    var productForm = getProductFormForSection(sectionId);

    if (!productForm) return;

    productForm.dataset.ppSubSubmitBound = 'true';

    if (productForm.__ppSubSubmitHandlerAttached) return;
    productForm.__ppSubSubmitHandlerAttached = true;

    productForm.addEventListener(
      'submit',
      function () {
        var widget = getSubscriptionWidget(sectionId);

        if (widget) {
          forceSyncWidgetToForm(widget);
        } else {
          clearSellingPlanInput(sectionId);
        }
      },
      true
    );
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) {
      return window.CSS.escape(value);
    }

    return String(value).replace(/"/g, '\\"');
  }

  // ─── Video Popup ──────────────────────────────────────────────────────────

  function initVideoPopup() {
    var modal = document.getElementById('pp-video-modal');
    if (!modal) return;

    var overlay = modal.querySelector('.pp-video-modal__overlay');
    var closeBtn = modal.querySelector('.pp-video-modal__close');
    var iframe = modal.querySelector('#pp-video-iframe');
    var videoEl = modal.querySelector('#pp-video-el');

    function openModal(url) {
      if (iframe) {
        var embedUrl = toEmbedUrl(url);
        iframe.src = embedUrl + (embedUrl.indexOf('?') !== -1 ? '&' : '?') + 'autoplay=1';
      } else if (videoEl) {
        videoEl.src = url;
        videoEl.play();
      }

      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';

      if (closeBtn) {
        closeBtn.focus();
      }
    }

    function closeModal() {
      modal.setAttribute('hidden', '');
      document.body.style.overflow = '';

      if (iframe) {
        iframe.src = '';
      }

      if (videoEl) {
        videoEl.pause();
        videoEl.src = '';
      }
    }

    document.querySelectorAll('.pp-video-btn').forEach(function (btn) {
      if (btn.dataset.ppVideoBound === 'true') return;
      btn.dataset.ppVideoBound = 'true';

      btn.addEventListener('click', function () {
        openModal(this.dataset.videoUrl);
      });
    });

    if (closeBtn && closeBtn.dataset.ppVideoBound !== 'true') {
      closeBtn.dataset.ppVideoBound = 'true';
      closeBtn.addEventListener('click', closeModal);
    }

    if (overlay && overlay.dataset.ppVideoBound !== 'true') {
      overlay.dataset.ppVideoBound = 'true';
      overlay.addEventListener('click', closeModal);
    }

    if (document.documentElement.dataset.ppVideoEscBound !== 'true') {
      document.documentElement.dataset.ppVideoEscBound = 'true';

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
          closeModal();
        }
      });
    }
  }

  function toEmbedUrl(url) {
    var ytLong = url.match(/[?&]v=([^&]+)/);

    if (ytLong) {
      return 'https://www.youtube.com/embed/' + ytLong[1];
    }

    var ytShort = url.match(/(?:youtu\.be\/|youtube\.com\/embed\/)([^?&/]+)/);

    if (ytShort) {
      return 'https://www.youtube.com/embed/' + ytShort[1];
    }

    var vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);

    if (vimeo) {
      return 'https://player.vimeo.com/video/' + vimeo[1];
    }

    return url;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    initPackSizeCards();
    initSubscriptionWidget();
    initVideoPopup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();



// accordions--js
document.querySelectorAll('.product__accordion details').forEach((details) => {
  const summary = details.querySelector('summary');
  const content = details.querySelector('.accordion__content');

  if (!summary || !content) return;

  summary.addEventListener('click', (e) => {
    e.preventDefault();

    if (details.open) {
      content.style.maxHeight = content.scrollHeight + 'px';

      requestAnimationFrame(() => {
        content.style.maxHeight = '0px';
      });

      content.addEventListener(
        'transitionend',
        function handler() {
          details.removeAttribute('open');
          content.removeEventListener('transitionend', handler);
        },
        { once: true }
      );

    } else {
      details.setAttribute('open', '');

      requestAnimationFrame(() => {
        content.style.maxHeight = content.scrollHeight + 'px';
      });
    }
  });
});


// slider--prgress--bar--pagination
