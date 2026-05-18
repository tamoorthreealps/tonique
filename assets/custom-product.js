function initSubscriptionWidget() {
  document.removeEventListener('change', window.__ppSubChangeHandler || function () {});
  document.removeEventListener('click', window.__ppSubClickHandler || function () {});

  function getActiveSectionId() {
    var widget = document.querySelector('.pp-sub-widget');
    if (widget && widget.dataset.sectionId) return widget.dataset.sectionId;

    var input = document.querySelector('input[id^="pp-selling-plan-"]');
    if (input) return input.id.replace('pp-selling-plan-', '');

    return null;
  }

  function getSubData(sectionId) {
    var dataEl = document.getElementById('pp-sub-data-' + sectionId);
    if (!dataEl) return null;

    try {
      return JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error('[pp-sub] JSON parse failed:', e);
      return null;
    }
  }

  function setPurchaseType(widget, type) {
    if (!widget) return;

    var sectionId = widget.dataset.sectionId;
    var subscribeOpt = widget.querySelector('.pp-sub-option--subscribe');
    var onetimeOpt = widget.querySelector('.pp-sub-option--onetime');
    var select = widget.querySelector('.pp-sub-delivery__select');
    var sellingPlanInput = document.getElementById('pp-selling-plan-' + sectionId);

    var isSub = type === 'subscribe';

    if (subscribeOpt) subscribeOpt.classList.toggle('is-selected', isSub);
    if (onetimeOpt) onetimeOpt.classList.toggle('is-selected', !isSub);

    if (sellingPlanInput) {
      if (isSub && select && select.value) {
        sellingPlanInput.disabled = false;
        sellingPlanInput.value = select.value;
      } else {
        sellingPlanInput.disabled = true;
        sellingPlanInput.value = '';
      }
    }
  }

  function rebuildPlanDropdown(widget, allocations) {
    var select = widget && widget.querySelector('.pp-sub-delivery__select');
    if (!select) return;

    select.innerHTML = '';

    allocations.forEach(function (alloc, index) {
      var option = document.createElement('option');
      option.value = String(alloc.selling_plan_id);
      option.textContent = alloc.name || ('Plan ' + (index + 1));
      if (index === 0) option.selected = true;
      select.appendChild(option);
    });
  }

  function updateWidgetForVariant(sectionId, variantId) {
    var subData = getSubData(sectionId);
    if (!subData || !subData.variants) return;

    var widget = document.querySelector('.pp-sub-widget');
    var sellingPlanInput = document.getElementById('pp-selling-plan-' + sectionId);
    var vData = subData.variants[String(variantId)];

    if (!vData) return;

    var allocations = vData.allocations || [];
    var hasAlloc = allocations.length > 0;

    if (widget) widget.style.display = hasAlloc ? '' : 'none';

    if (!hasAlloc) {
      if (sellingPlanInput) {
        sellingPlanInput.disabled = true;
        sellingPlanInput.value = '';
      }
      return;
    }

    rebuildPlanDropdown(widget, allocations);

    var select = widget && widget.querySelector('.pp-sub-delivery__select');
    var alloc = allocations[0];
    var packSize = vData.pack_size || 1;

    var subPriceEl = widget && widget.querySelector('.pp-sub-subscribe-price');
    var subPerUnitEl = widget && widget.querySelector('.pp-sub-subscribe-per-unit');
    var otPriceEl = widget && widget.querySelector('.pp-sub-onetime-price');
    var otPerUnitEl = widget && widget.querySelector('.pp-sub-onetime-per-unit');
    var savingsBanner = widget && widget.querySelector('.pp-sub-savings-banner');
    var savingsText = widget && widget.querySelector('.pp-sub-savings-banner__text');

    if (subPriceEl) subPriceEl.textContent = formatMoney(alloc.price);
    if (subPerUnitEl) subPerUnitEl.textContent = formatMoney(Math.round(alloc.price / packSize)) + '/pouch';

    if (otPriceEl) otPriceEl.textContent = formatMoney(vData.price);
    if (otPerUnitEl) otPerUnitEl.textContent = formatMoney(Math.round(vData.price / packSize)) + '/pouch';

    var savings = alloc.compare_at_price - alloc.price;

    if (savingsBanner) {
      if (savings > 0) {
        var pct = Math.round((savings * 100) / alloc.compare_at_price);
        if (savingsText) savingsText.textContent = 'Save ' + pct + '% (' + formatMoney(savings) + ' off)';
        savingsBanner.style.display = '';
      } else {
        savingsBanner.style.display = 'none';
      }
    }

    var checked = widget && widget.querySelector('.pp-sub-type-radio:checked');
    var isSubSelected = checked && checked.value === 'subscribe';

    if (sellingPlanInput) {
      if (isSubSelected && select) {
        sellingPlanInput.disabled = false;
        sellingPlanInput.value = select.value;
      } else {
        sellingPlanInput.disabled = true;
        sellingPlanInput.value = '';
      }
    }
  }

  window.__ppSubChangeHandler = function (e) {
    if (e.target.matches('.pp-sub-type-radio')) {
      var widget = e.target.closest('.pp-sub-widget');
      setPurchaseType(widget, e.target.value);
      return;
    }

    if (e.target.matches('.pp-sub-delivery__select')) {
      var widget = e.target.closest('.pp-sub-widget');
      var sectionId = widget && widget.dataset.sectionId;
      var input = sectionId && document.getElementById('pp-selling-plan-' + sectionId);
      var checked = widget && widget.querySelector('.pp-sub-type-radio:checked');

      if (input) {
        if (checked && checked.value === 'subscribe') {
          input.disabled = false;
          input.value = e.target.value;
        } else {
          input.disabled = true;
          input.value = '';
        }
      }
      return;
    }

    var sectionId = getActiveSectionId();

    if (
      sectionId &&
      e.target.name === 'id' &&
      e.target.closest('#product-form-' + sectionId)
    ) {
      updateWidgetForVariant(sectionId, e.target.value);
    }
  };

  window.__ppSubClickHandler = function (e) {
    var opt = e.target.closest('.pp-sub-option');
    if (!opt || e.target.closest('select')) return;

    var radio = opt.querySelector('.pp-sub-type-radio');

    if (radio && !radio.checked) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  document.addEventListener('change', window.__ppSubChangeHandler);
  document.addEventListener('click', window.__ppSubClickHandler);

  if (window.subscribe && window.PUB_SUB_EVENTS) {
    window.subscribe(window.PUB_SUB_EVENTS.variantChange, function (pubSubData) {
      var sectionId = getActiveSectionId();
      var variant = pubSubData && pubSubData.data && pubSubData.data.variant;

      if (sectionId && variant) {
        updateWidgetForVariant(sectionId, variant.id);
      }
    });
  }

  var sectionId = getActiveSectionId();
  var productForm = sectionId && document.getElementById('product-form-' + sectionId);

  if (productForm && !productForm.dataset.ppSubSubmitBound) {
    productForm.dataset.ppSubSubmitBound = 'true';

    productForm.addEventListener('submit', function () {
      var currentSectionId = getActiveSectionId();
      var widget = document.querySelector('.pp-sub-widget');
      var checked = widget && widget.querySelector('.pp-sub-type-radio:checked');
      var isSubSelected = checked && checked.value === 'subscribe';
      var select = widget && widget.querySelector('.pp-sub-delivery__select');
      var ourInput = currentSectionId && document.getElementById('pp-selling-plan-' + currentSectionId);

      productForm.querySelectorAll('[name="selling_plan"]').forEach(function (input) {
        input.disabled = true;
        input.value = '';
      });

      if (isSubSelected && ourInput && select && select.value) {
        ourInput.disabled = false;
        ourInput.value = select.value;
      }
    }, true);
  }

  var widget = document.querySelector('.pp-sub-widget');
  if (widget) {
    var checkedRadio = widget.querySelector('.pp-sub-type-radio:checked');
    setPurchaseType(widget, checkedRadio ? checkedRadio.value : 'subscribe');
  }
}