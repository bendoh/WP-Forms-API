/**
 * Deal with various features of the fancy "Forms UI" type implementaion
 */
(function($) {
	var fapi = window.wpFormsApi = window.wpFormsApi || {}
		, media = wp.media;

	// Adjust styles to account for variations when using box-sizing
	$.widget('custom.postListMenu', $.ui.autocomplete, {
		_resizeMenu: function() {
			this.menu.element.width($(this.element).outerWidth());
			$(this.menu.element).css('z-index', 10000000);
		},
	});

	var loadMCETemplates = function(content, editor) {
		wp.ajax.post('wp_form_get_mce_templates', {
			content: content
		}).done(function(result) {
			_.each(result, function(html, id) {
				var $box = $('#' + id).parent();

				$box.html(html);

				if(editor) {
					$box.find('.wp-editor-wrap').addClass(editor == 'html' ? 'html-active' : 'tmce-active');
				}

				var config = _.clone(tinyMCEPreInit.mceInit.wpfapiTemplate);

				config.selector = id;
				config.toolbar1 = ['bold', 'italic', 'underline', 'blockquote', 'strikethrough', 'bullist', 'numlist', 'alignleft', 'aligncenter', 'alignright', 'undo', 'redo', 'link', 'unlink'].join(',');
				config.toolbar2 = config.toolbar3 = config.toolbar4 = '';
				config.plugins = ['colorpicker', 'lists', 'fullscreen', 'image', 'wordpress', 'wpeditimage', 'wplink' ].join(',');
				config.cache_suffix += '-' + id;

				quicktags(id);

				tinyMCEPreInit.mceInit[id] = config;

				if(editor != 'html') {
					tinymce.init(config);
				}
			});

			QTags._buttonsInit();
		});
	}

	// Any dynamically-inserted MCE containers
	var initializeMCE = function(context) {
		var request = {};

		// Build up a query to get templates from AJAX
		$(context).find('.wp-form-type-mce textarea').each(function() {
			request[this.id] = this.value;
		});

		loadMCETemplates(request, 'html');
	}

	// Multiple-list field
	var initializeMultiple = function(context) {
		$(context).find('.wp-form-multiple').each(function() {
			var $container = $(this)
			  , $list = $container.find('.wp-form-multiple-list')
			  , $tmpl = $container.find('.wp-form-multiple-template')
			;

			// do not re-initialize
			if ($container.data('initialized')) {
				return;
			}

			function reindex() {
				// Note which elements are checked to prevent radio buttons from losing
				// their checked state when elements are renamed (and there is a brief
				// name collision!)
				var $checked = $list.find(':checked');

				$list.find('> li').each(function(i) {
					var $item = $(this);

					$item.find('*').each(function() {
						// Replace patterns like -2- or [4] with -$index- and [$index] in attributes
						// Not exactly super safe, but easy
						for(var j = 0; j < this.attributes.length; j++) {
							this.attributes[j].value = this.attributes[j].value.replace(
								/([ \w_\[\]-]+[\[-])\d+([\]-][ \w_\[\]-]+)/g, '$1' + i + '$2');
						}
					});
				});

				$checked.prop('checked', true);
			}

			$list.sortable({
				handle: '.sort-multiple-item',
				update: reindex
			});

			$container
				// Add a new multiple item on click
				.on('click', '.add-multiple-item', function() {
					var $t = $(this),
						count = $list.children('li').length,
						$html = $($tmpl.text().replace(/%INDEX%/g, count));

					initialize($html);

					$list.append($html);

					initializeMCE($html);
				})

				// Remove an item item on click
				.on('click', '.remove-multiple-item', function() {
					var $t = $(this),
						$item = $t.parents('li');

					$item.remove();

					reindex();
				});

			// prevent double init which would register multiple click handlers
			$container.data('initialized', true);
		});
	}

	// Image field
	if (media && typeof media == 'function') {
		var WPFormImageField = media.View.extend({
			template: media.template('wp-form-attachment-field'),
			events: {
				'change .wp-form-attachment-id': 'update',
				'click .attachment-delete': 'removeAttachment',
				'click .attachment-container': 'selectAttachment'
			},

			selectAttachment: function() {
				var view = this,
					frameOpts = {
						frame: 'select',
						title: this.input_type == 'image' ? "Select Image" : "Select Attachment"
					};

				if(this.input_type == 'image') {
					frameOpts.library = { type: 'image' };
				}

				media.frame = media(frameOpts).open();

				media.frame.on('select', function(el) {
					var image = this.get('library').get('selection').single();

					view.model.set(image.attributes);
				});
			},

			removeAttachment: function() {
				// Don't clear the model entirely, just the set values
				this.model.set({
					id: null,
					title: null,
					link: null,
					url: null,
					editLink: null
				});
			},

			initialize: function() {
				if(!this.model) {
					this.model = new Backbone.Model();
				}

				this.model.on('change', this.render, this);
			},

			prepare: function() {
				return this.model.toJSON();
			},

			update: function() {
				var view = this,
					$field = this.$el.find('.wp-form-attachment-id'),
					attachmentId = $field.val(),
					attachment = media.model.Attachment.get(attachmentId).clone(),
					inputName = view.model.get('input_name'),
					inputType = view.model.get('input_type');

				view.model.clear({ silent: true });
				view.model.set({
					id: attachmentId,
					input_name: inputName,
					input_type: inputType
				});

				$field.addClass('ui-dirty');

				attachment.fetch()
					.done(function() {
						$field.removeClass('ui-dirty');
						view.model.set(this.attributes);
					})
					.fail(function() {
						$field.addClass('ui-dirty');
					});
			}
		});

		var initializeAttachments = function(context) {
			$(context).find('.select-attachment-field').each(function() {
				var view = new WPFormImageField({
					model: media.model.Attachment.get(this.value).clone()
				});

				view.model.fetch();

				view.model.set('input_name', this.name || $(this).find('input').attr('name'));
				view.model.set('input_type', $(this).data('attachment-type'));

				view.render();

				view.$el.attr('class', $(this).attr('class'));
				view.$el.data('view', view);

				$(this).replaceWith(view.$el);
			});
		}
	}

	var initializePostSelect = function(context, args) {
		args = args || {};

		$(context).find('.wp-form-post-select').each(function() {
			var items = new Backbone.Collection(),
			  $input = $(this),
			  $field = $input.prev('input'),
			  model = new Backbone.Model({ id: $input.val() });

			if($field.length == 0) {
				$field = $('<input type="text" />');
			}

			$(this).before($field);

			if($input.data('title')) {
				$field.val($input.data('title'));
				model.set('title', $input.data('title'));
			}

			$field.attr('placeholder', $input.attr('placeholder'));

			var update = function(ev, ui) {
				var id = ui.item && ui.item.model.get('id');

				$input.val(id);
				$input.trigger('selected', ui.item);
			};

			// Extend jQuery UI autocomplete with a custom resizer
			$field.postListMenu(_.extend(args, {
				source: function(request, response) {
					var attrs = { term: request.term };

					if($input.data('post-type')) {
						attrs['post_type'] = $input.data('post-type').split(' ');
					}

					wp.ajax.post('wp_form_search_posts', attrs)
						.done(function(data) {
							response(_.map(data, function(v) {
								v.id = v.ID;

								var itemModel = new Backbone.Model(v);

								items.remove(v.id);
								items.add(itemModel);

								return {
									label: v.post_title,
									value: v.post_title,
									model: itemModel
								}
							}));
						})
						.fail(function(data) {
							response([]);
						});
				},
				change: update,
				select: update,
				minLength: 0
			}));

			$input.trigger('selected', { model: model });
		});
	}

	var initializeTermSelect = function(context) {
		$(context).find('.wp-form-term-select').each(function() {
			var items = new Backbone.Collection(),
			  $input = $(this),
			  $field = $input.prev('input');

			if($field.length == 0) {
				$field = $('<input type="text" />');
			}

			$(this).before($field);

			if($input.data('name')) {
				$field.val($input.data('name'));
			}

			$field.attr('placeholder', $input.attr('placeholder'));
			$field.attr('class', $input.attr('class').replace(/\bwp-form-[^\s]*\s*/g, ''));

			var update = function(ev, ui) {
				var id = ui.item ? ui.item.model.get('term_id') : '',
						label = ui.item ? ui.item.model.get('name') : '';

				$input.val(id);
				$input.trigger('selected', ui.item);
			};

			$field.autocomplete({
				source: function(request, response) {
					var attrs = { term: request.term };

					if($input.data('taxonomy')) {
						attrs['taxonomy'] = $input.data('taxonomy');
					}

					wp.ajax.post('wp_form_search_terms', attrs)
						.done(function(data) {
							response(_.map(data, function(v) {
								v.id = v.ID;

								var itemModel = new Backbone.Model(v);

								items.remove(v.id);
								items.add(itemModel);

								return {
									label: v.name,
									value: v.name,
									model: itemModel
								}
							}));
						})
						.fail(function(data) {
							response([]);
						});
				},
				change: update,
				select: update,
				minLength: 0
			});
		});
	}

	function initializeConditionalLogic(context) {
		$(context).find('[data-conditional]:not(div), div[data-conditional] input[type=radio]').on('change', conditionalLogicInputChange).trigger('change');
	}

	function conditionalLogicInputChange() {
		var $this = $(this)
		  , conditions = $this.closest('[data-conditional]').data('conditional')
			// For checkboxes, we cannot use .val() because it will always
			// return the value attribute regardless if the checkbox is checked
		  , inputValue = $this.is(':checkbox:not(:checked)') ? false : $this.val()
		;

		// no conditions? bail!
		if (!(conditions instanceof Object)) return;

		// for radios, we need to find the currently selected radio of the bunch
		if ($this.attr('type') === 'radio') {
			inputValue = $(document.getElementsByName($this.attr('name'))).find(':checked').val();
		}

		// loop through conditions and apply classes
		// { 'element value': { 'target selector': 'class to add', ... }, ... }
		for (var value in conditions) {
			if (conditions[value] instanceof Object) {
				for (var selector in conditions[value]) {
					$(selector).toggleClass(conditions[value][selector], value == inputValue);
				}
			}
		}
	}

	function initialize(context) {
		if (media && typeof media == 'function') {
			initializeAttachments(context);
		}

		initializePostSelect(context);
		initializeTermSelect(context);
		initializeConditionalLogic(context);
		initializeMultiple(context);
	}

	$(function() {
		initialize('body');
	});

	fapi.setup = initialize;

	if (media && typeof media == 'function') {
		fapi.initializeAttachments = initializeAttachments;
	}

	fapi.initializePostSelect = initializePostSelect;
	fapi.initializeTermSelect = initializeTermSelect;
	fapi.initializeConditionalLogic = initializeConditionalLogic;
	fapi.initializeMultiple = initializeMultiple;
})(jQuery);
