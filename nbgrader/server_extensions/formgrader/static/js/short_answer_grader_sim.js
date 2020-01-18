function ShortAnswerGrader(api_url) {
    this.api_url = api_url;
}

ShortAnswerGrader.prototype.init = function(){
    this.$question_tupples = []

    this.find_question_tupples();
    this.get_similarity_from_api();
    this.creat_range_filter();

    

    // $("div[data-solution-id]").each(function(index, element){
    //     if(index ==0 ) {
    //         $ref_element = $(element);
    //         $answer_element = $ref_element.parent().next().find(".panel-body .rendered_html");
    //         $question_element =  $ref_element.parent().parent().parent().prev().find(".inner_cell .rendered_html");

    //         [$question_element, $answer_element, $ref_element] = self.create_mock_elements($question_element, $answer_element, $ref_element);
    //         self.highlight_max_similar_phrase_pair($question_element, $answer_element, $ref_element);
    //     }
    // });
}

ShortAnswerGrader.prototype.find_question_tupples = function(){
    var self = this;
    $("div[data-solution-id]").each(function(index, element){
        var $ref_element = $(element);
        var $answer_element = $ref_element.parent().next().find(".panel-body .rendered_html");
        var $question_element =  $ref_element.parent().parent().parent().prev().find(".inner_cell .rendered_html");

        self.$question_tupples.push([$question_element, $answer_element, $ref_element]);
    });
}

ShortAnswerGrader.prototype.get_similarity_from_api = function(){
    var self = this;
    var answer_cells = [];
    var solution_cells = []
    $.each(this.$question_tupples, function(index, item_list){
        [$question_element, $answer_element, $ref_element] = item_list;

        answer_cells.push({
            answer: $answer_element.text().trim().replace(/\u00B6/g, "")
        });
        solution_cells.push({
            question: $question_element.text().trim().replace(/\u00B6/g, ""),
            ref: $ref_element.text().trim().replace(/\u00B6/g, "")
        });
    });

    data = {
        task: {
            cells: answer_cells
        },
        solution: {
            cells: solution_cells
        }
    };

    $.ajax({
        url: this.api_url,
        dataType: 'json',
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify(data),
        processData: false,
        success: function( response, textStatus, jQxhr ){
            self.hash = {};
            $.each(response, function(index, res){
                self.hash[self.$question_tupples[index][2].attr("data-solution-id")] = res;
            });
            self.fill_scores();
            self.create_mock_elements();
            self.highlight_refs();
            self.highlight_answers();
            self.enable_phrase_highlight();
            self.highlight_demoted_text();
            self.enable_tooltip();
        },
        error: function( jqXhr, textStatus, errorThrown ){
            console.log( "An error occurred while getting similarity from API:" + errorThrown );
        }
    });
}

ShortAnswerGrader.prototype.enable_tooltip = function() {
    $('#notebook [data-toggle="tooltip"]').tooltip({html: true});
}

ShortAnswerGrader.prototype.creat_range_filter = function() {
    var self = this;

    var $container = $("#notebook > .container");
    var $sections = $container.children();
    $range_section = $($sections[2].outerHTML);
    $range_section.insertAfter($container.find("> div.cell").eq(2));

    $clone_hr = $range_section.clone();
    $range_section.find(".inner_cell .rendered_html").html(`
        <div class="form-group">
            <label class="filter-label" for="similarityFilter" data-toggle="tooltip" title="Highlights similarities above the threshold only">Similarity Threshold:</label>
            <div class="filter-container">
                <input type="range" class="form-control-range" id="similarityFilter"
                    data-slider-min="1" data-slider-max="100" data-slider-step="1" data-slider-value="30"
                    data-slider-handle="square">
            </div>
        </div>
    `);

    this.$filter = $range_section.find("#similarityFilter").slider({
        formatter: function(value) {
            return value + '%';
        }
    });

    if($.cookie("similarity_filter")) {
        this.$filter.slider("setValue", $.cookie("similarity_filter"));
    }

    // Adds delay for filtering for rapid change of filter value
    var filter = function(){
        self.filter_similarity();
    }

    var delayed_filter = _.debounce(filter, 1000);

    this.$filter.on("change", function(slideEvt) {
        $.cookie("similarity_filter", slideEvt.value.newValue,  { expires: 365 });
        delayed_filter();
    });

    // $clone_hr.clone().insertAfter($container.find("> div.cell").eq(3));
}

ShortAnswerGrader.prototype.filter_similarity = function() {
    var self = this;
    
    $("#notebook span.word[data-max-match]").each(function(index, element){
        var $element = $(element);
        var attribute_value = parseFloat($element.data("max-match"));

        self.highlight_max_similar_phrase_item($element, attribute_value);
    });
}


ShortAnswerGrader.prototype.fill_scores = function() {
    var self = this;
    $.each(this.$question_tupples, function(tupple_index, elements){
        [$question_element, $answer_element, $ref_element] = elements;
        
        var hash_key = $ref_element.attr("data-solution-id");
        var response = self.hash[hash_key];

        var full_score = parseFloat($ref_element.attr("data-points"));
        var $score_element = $answer_element.parent().prev().find("input.score");
        if($score_element.val() == "") {
            $score_element.addClass("auto-graded");
            $score_element.val(Math.round(response.sim * full_score));
            $score_element.trigger("change");

            $score_element.change(function(){
                $score_element.removeClass("auto-graded");
            });
        }
    });
}

ShortAnswerGrader.prototype.create_mock_elements = function() {
    var $question_element, $answer_element, $ref_element;
    var self = this;
    var mock_question_tupples = []
    $.each(this.$question_tupples, function(tupple_index, elements){
        [$question_element, $answer_element, $ref_element] = elements;
        
        var hash_key = $ref_element.attr("data-solution-id");
        var response = self.hash[hash_key];

        var mock_elements = [];
        $.each(elements, function(index, $element) {
            var tokens = [];
            if(index == 0)
                tokens = response.question;
            else if(index == 1)
                tokens = response.answer;
            else
                tokens = response.ref
                
            var $mock_element = $($element.prop('outerHTML'));

            $mock_element.empty();
            $mock_element.attr("data-text", _.map(tokens, function(t){return t.text}).join(" "));

            $.each(tokens, function(_, t){
                $mock_element.append($('<span class="word-container"><span class="word" data-text="' + t.text + '" data-lemma="' + t.lemma + '">' + t.text.replace('_', ' ') + '</span></span>'));
            });

            mock_elements.push($mock_element);

            $element.parent().append($mock_element);

            $element.addClass("hidden");

            // Highlight question
            if (index == 0)
                $mock_element.addClass("question-text");
        });
        mock_question_tupples.push(mock_elements)
    });
    self.$mock_question_tupples = mock_question_tupples;
}

ShortAnswerGrader.prototype.highlight_refs = function() {
    var $question_element, $answer_element, $ref_element;
    var self = this;

    $.each(this.$mock_question_tupples, function(index_tuple, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;

        var response = self.hash[$ref_element.attr("data-solution-id")];
        var match_hash = self.get_word_matches_hash(response.match.items, "ref", "answer");

        // Highlight ref section
        $ref_element.find("span.word").each(function(index_word, word){
            var $word = $(word);

            // Highlight similarity with answer
            if(match_hash[$word.data("text")] && Array.isArray(match_hash[$word.data("text")])) {
                matches_for_word = match_hash[$word.data("text")];
                var max_match_score = _.max(matches_for_word, function(m){return m.sim;});

                $word.attr("data-max-match", max_match_score.sim);
                $word.attr("data-toggle", "tooltip");
                $word.attr("data-index", index_word);

                self.highlight_max_similar_phrase_item($word, max_match_score.sim);
                
                match_tooltip_title = _.map(matches_for_word, function(m){
                    return m.text + "(" + Math.round(m.sim * 100) + "%)";
                }).join(", ")
                $word.attr("title", match_tooltip_title);

                matche_list = _.map(matches_for_word, function(m){
                    return m.text;
                }).join(",")
                $word.attr("data-matches", matche_list);
            }
        });

    });
}

ShortAnswerGrader.prototype.highlight_answers = function() {
    var $question_element, $answer_element, $ref_element;
    var self = this;

    $.each(this.$mock_question_tupples, function(index_tuple, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;

        var response = self.hash[$ref_element.attr("data-solution-id")];
        var match_hash = self.get_word_matches_hash(response.match.items, "answer", "ref");

        // Highlight answer section
        $answer_element.find("span.word").each(function(index_word, word){
            var $word = $(word);

            // Check if any of the answer phrases contains this word
            var answer = _.map(response.answer, function(item){
                return item.text;
            });
            var belongs_to_a_phrase = _.some(response.match.items, function(item){
                var matching_words = _.map(item.matches, function(m){
                    return m.answer;
                });

                var match_contains_word = _.contains(matching_words, $word.data("text"));

                if(match_contains_word) {
                    var phrase = _.map(response.match.answer_phrases[item.answer_index].tokens, function(t){
                        return t.original;
                    });
                    return self.fit_phrase_with_answer(index_word, answer, phrase).length > 0;
                }

                return false;
            })

            // Highlight similarity with ref
            if(belongs_to_a_phrase){
                if(match_hash[$word.data("text")] && Array.isArray(match_hash[$word.data("text")])) {
                    matches_for_word = match_hash[$word.data("text")];
                    var max_match_score = _.max(matches_for_word, function(m){return m.sim;});

                    $word.attr("data-max-match", max_match_score.sim);
                    $word.attr("data-toggle", "tooltip");
                    $word.attr("data-index", index_word);

                    self.highlight_max_similar_phrase_item($word, max_match_score.sim);
                    
                    match_tooltip_title = _.map(matches_for_word, function(m){
                        return m.text + "(" + Math.round(m.sim * 100) + "%)";
                    }).join(", ")
                    $word.attr("title", match_tooltip_title);

                    matche_list = _.map(matches_for_word, function(m){
                        return m.text;
                    }).join(",")
                    $word.attr("data-matches", matche_list);
                }
            }
        });

        self.find_answer_phrases(tupple, match_hash);
    });
}

ShortAnswerGrader.prototype.find_answer_phrases = function(tupple, hash) {
    var $question_element, $answer_element, $ref_element;
    var self = this;

    [$question_element, $answer_element, $ref_element] = tupple;

    var response = self.hash[$ref_element.attr("data-solution-id")];

    $answer_element.find("span.word.badge").each(function(index_word, word){
        var $word = $(word);
        var answer_phrases = [];

        // Find phrases for each possible word match with the current word
        if(hash[$word.data("text")] && Array.isArray(hash[$word.data("text")])) {
            $.each(hash[$word.data("text")], function(index_pair, pair){
                $.each(response.match.items, function(index_item, item){
                    var contains_pair = _.where(item.matches, {answer: $word.data("text"), ref: pair.text}).length > 0;
                    if(contains_pair) {
                        var mapped_answer_phrase = {
                            index: item.answer_index,
                            priority: response.match.answer_phrases[item.answer_index].priority,
                            tokens: _.map(response.match.answer_phrases[item.answer_index].tokens, function(token){
                                return token.original;
                            })
                        };

                        var mapped_ref_phrase = {
                            index: item.ref_index,
                            priority: response.match.ref_phrases[item.ref_index].priority,
                            tokens: _.map(response.match.ref_phrases[item.ref_index].tokens, function(token){
                                return token.original;
                            })
                        };
                        answer_phrases.push({
                            answer_phrase: mapped_answer_phrase,
                            ref_phrase: mapped_ref_phrase,
                            ref: pair.text,
                            sim: item.sim
                        });
                    }
                });
            });
        }

        // Filter answer phrases where current word fits
        if(answer_phrases.length > 0) {
            var word_index = $word.data("index");
            var answer = _.map(response.answer, function(item){
                return item.text;
            });

            var ref = _.map(response.ref, function(item){
                return item.text;
            });
    
            var matching_answer_phrases = _.filter(answer_phrases, function(p){
                return self.fit_phrase_with_answer(word_index, answer, p.answer_phrase.tokens).length > 0;
            });
    
            var priority_one_phrases = _.filter(matching_answer_phrases, function(item){
                return item.answer_phrase.priority == 1;
            });
    
            if(priority_one_phrases.length > 0) {
                answer_phrases = priority_one_phrases;
            }

            var priority_one_ref_phrases = _.filter(matching_answer_phrases, function(item){
                return item.ref_phrase.priority == 1;
            });

            if(priority_one_ref_phrases.length > 0) {
                answer_phrases = priority_one_ref_phrases;
            }

            var max_matching_phrase = _.last(_.sortBy(answer_phrases, function(item){
                    return item.sim;
                })
            );

            // Match answer phrases
            var matches = self.fit_phrase_with_answer(word_index, answer, max_matching_phrase.answer_phrase.tokens);
            var match = _.first(_.sortBy(matches, function(item){
                return item.mis_match;
            }));

            $word.attr("data-answer-phrase-start", match.start);
            $word.attr("data-answer-phrase-end", match.end);
            $word.attr("data-answer-phrase-tokens", max_matching_phrase.answer_phrase.tokens);

            // Match ref phrases
            var matches = self.fit_phrase_with_ref(max_matching_phrase.ref, ref, max_matching_phrase.ref_phrase.tokens);
            var match = _.first(_.sortBy(matches, function(item){
                return item.mis_match;
            }));

            $word.attr("data-ref-phrase-start", match.start);
            $word.attr("data-ref-phrase-end", match.end);
            $word.attr("data-ref-phrase-tokens", max_matching_phrase.ref_phrase.tokens);
        }
    });
}

ShortAnswerGrader.prototype.fit_phrase_with_ref = function(word, ref, phrase) {
    var matches = this.find_matches(ref, phrase);
    var matches_containing_word = _.filter(matches, function(m){
        var slice = ref.slice(m.start, m.end+1);
        return _.contains(slice, word);
    });

    return matches_containing_word;
}

ShortAnswerGrader.prototype.fit_phrase_with_answer = function(word_index, answer, phrase) {
    var matches = this.find_matches(answer, phrase);
    var matches_containing_word = _.filter(matches, function(m){
        return word_index >= m.start && word_index <= m.end;
    });

    return matches_containing_word;
}

ShortAnswerGrader.prototype.find_matches = function(answer, phrase) {
    var match, mis_match_count, end_index;
    var self = this;
    var matches = [];

    if(answer.length > 0 && phrase.length > 0) {
        for(var answer_index = 0; answer_index < answer.length; answer_index++) {
            if(answer[answer_index] == phrase[0]) {
                [match, mis_match_count, end_index] = self.find_match(answer_index, answer, phrase);
                if(match) {
                    matches.push({
                        start: answer_index,
                        end: end_index,
                        mis_match: mis_match_count
                    });
                }
            }
        }
    }
    return matches;
}

ShortAnswerGrader.prototype.find_match = function(answer_index, answer, phrase) {
    var mis_match = 0;
    var end_index_answer = answer_index;
    var end_index_phrase = 0;
    while(end_index_answer < answer.length && end_index_phrase < phrase.length) {
        if(answer[end_index_answer] == phrase[end_index_phrase]) {
            if(end_index_phrase == phrase.length -1){
                return [true, mis_match, end_index_answer];
            } 
            end_index_answer++;
            end_index_phrase++;
        } else {
            mis_match++;
            end_index_answer++;
        }
    }

    return [false, -1, -1];
}

ShortAnswerGrader.prototype.get_word_matches_hash = function(items, key, ref_key) {
    var hash = {};

    for(var index_item=0; index_item < items.length; index_item++) {
        var item = items[index_item];

        for(var index_match=0; index_match < item.matches.length; index_match++) {
            var match = item.matches[index_match];

            var key_text = match[key];
            var ref_text = match[ref_key];

            if(hash[key_text] && Array.isArray(hash[key_text])){
                var existing_match = _.first(_.where(hash[key_text], {text: ref_text}));
                if(existing_match) {
                    existing_match.sim.push(match.sim);
                } else {
                    hash[key_text].push({text: ref_text, sim: [match.sim]})
                }
            }else {
                hash[key_text] = [{text: ref_text, sim: [match.sim]}];
            }
        }
    }

    var response = {};

    for(var key in hash) {
        var ref_matches = _.map(hash[key], function(item){
            return {
                text: item.text,
                sim: (_.reduce(item.sim, function(memo, num){ return memo + num; }, 0)) / item.sim.length
            }
        });
        response[key] = ref_matches;
    }
    return response;
}

ShortAnswerGrader.prototype.enable_phrase_highlight = function(){
    var $question_element, $answer_element, $ref_element;
    var self = this;

    $.each(this.$mock_question_tupples, function(index_tupple, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;

        $answer_element.find("span.word.badge").each(function(index_word, word){
            var $word = $(word);

            $word.mouseenter(function(event){
                var $target_word = $(event.target);

                // Highlight answer phrase
                var answer_start = parseInt($target_word.data("answer-phrase-start"));
                var answer_end = parseInt($target_word.data("answer-phrase-end"));
                var answer_tokens = $target_word.data("answer-phrase-tokens").split(",");
                var answer_token_index = 0;

                var $phrase_container = $target_word.parent().parent();
                $.each($phrase_container.find("span.word-container"), function(index_container, container){
                    var $container = $(container);
                    var word_text = $container.find(".word").text();

                    if(index_container >= answer_start && index_container <= answer_end && 
                            answer_token_index < answer_tokens.length && answer_tokens[answer_token_index] == word_text) {
                        
                        $container.addClass("focus");
                        answer_token_index++;
                    }
                });

                // Highlight ref phrase
                var ref_start = parseInt($target_word.data("ref-phrase-start"));
                var ref_end = parseInt($target_word.data("ref-phrase-end"));
                var ref_tokens = $target_word.data("ref-phrase-tokens").split(",");
                var ref_token_index = 0;

                var $phrase_container = $target_word.parent().parent().parent().parent().prev();
                $.each($phrase_container.find("span.word-container"), function(index_container, container){
                    var $container = $(container);
                    var word_text = $container.find(".word").text();
                    if(index_container >= ref_start && index_container <= ref_end && 
                        ref_token_index < ref_tokens.length && ref_tokens[ref_token_index] == word_text) {
                        
                        $container.addClass("focus");
                        ref_token_index++;
                    }
                });
            });

            $word.mouseleave(function(event){
                var $target_word = $(event.target);

                // Remove focus from answer
                var $phrase_container = $target_word.parent().parent();
                $phrase_container.find("span.word-container").removeClass("focus");

                // Remove focus from ref
                var $phrase_container = $target_word.parent().parent().parent().parent().prev();
                $phrase_container.find("span.word-container").removeClass("focus");
            });
        });
    });
}

ShortAnswerGrader.prototype.highlight_demoted_text = function() {
    var $question_element, $answer_element, $ref_element;
    var self = this;

    $.each(this.$mock_question_tupples, function(index_tupple, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;
        var response = self.hash[$ref_element.attr("data-solution-id")];

        $answer_element.find("span.word").each(function(index_word, word){
            var $word = $(word);

            $.each(response.answer, function(index_token, token) {
                if($word.data("text") == token.text && token.current == "" && token.modifications.length > 0) {
                    var path = token.modifications[0].before;
                    
                    for(var ind=0; ind < token.modifications.length; ind++) {
                        path = path + " --> (" + token.modifications[ind].action + ") --> " + token.modifications[ind].after;
                    }

                    path+= "[EMPTY]";

                    $word.attr("data-toggle", "tooltip");
                    $word.attr("title", path);
                    $word.addClass("text-demotion");
                }
            });
        });
    });
}


ShortAnswerGrader.prototype.highlight_max_similar_phrase_item = function($word, similarity) {
    var filter_value = this.$filter.slider('getValue');

    if( Math.round(similarity * 100) < filter_value) {
        $word.removeClass("badge");
        $word.css("background-color", "transparent");
    } else{
        $word.addClass("badge");
        $word.css("background-color", this.get_similarity_color_code(similarity));
    }
}

ShortAnswerGrader.prototype.get_similarity_color_code = function(sim) {
    // Should be darker for higher similarity. 0XFF(255) is lightest 0X55(85) is darkest
    // var green_value = (parseInt((1.0-sim) * 170) + 85).toString(16);
    var green_value = parseInt(sim * 210).toString(16);
    return "#00" + green_value + "00";
}

$(window).load(function () {
    var grader = new ShortAnswerGrader("/grader/api/short-answer");
    grader.init();
});