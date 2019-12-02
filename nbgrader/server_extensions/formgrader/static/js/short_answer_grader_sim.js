function ShortAnswerGrader(api_url) {
    this.api_url = api_url;
}

ShortAnswerGrader.prototype.init = function(){
    this.$question_tupples = []

    this.find_question_tupples();
    this.get_similarity_from_api();
    this.creat_range_filter();
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
            self.find_matching_phrases();
            self.group_ref_chunks();
            self.enable_chunk_highlight();
            // self.highlight_refs();
            // self.highlight_answers();
            // self.enable_phrase_highlight();
            self.highlight_demoted_text();
            self.enable_tooltip();
        },
        error: function( jqXhr, textStatus, errorThrown ){
            console.log( "An error occurred while getting similarity from API:" + errorThrown );
        }
    });
}

ShortAnswerGrader.prototype.find_matching_phrases = function() {
    var $question_element, $answer_element, $ref_element;
    var self = this;

    $.each(this.$mock_question_tupples, function(index_tuple, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;

        var response = self.hash[$ref_element.attr("data-solution-id")];

        $ref_element.find("span.word").each(function(ref_word_index, word){
            var $word = $(word);

            // Find chunk that contains the word and does not contain any other chunk (To exclude sententences if they contain chunks)
            var matching_items = _.filter(response.match.items, function(item){
                ref_phrase = response.match.ref_phrases[item.ref_index];
                
                var phrase_contains_word = (ref_word_index >= ref_phrase.start_word_index && ref_word_index <= ref_phrase.end_word_index);

                var phrase_contains_other_phrase = _.some(response.match.ref_phrases, function(phrase){
                    if(phrase != ref_phrase) {
                        return (phrase.start_word_index >= ref_phrase.start_word_index && phrase.end_word_index <= ref_phrase.end_word_index)
                    }

                    return false;
                });

                return phrase_contains_word && !phrase_contains_other_phrase;
            });

            // Add attribute to the word for later steps
            if(matching_items.length > 0) {
                var max_match = _.max(matching_items, function(item){
                    return item.sim;
                });

                $word.attr("data-max-match", max_match.sim);
                $word.attr("data-toggle", "tooltip");

                var match_tooltip_title = _.map(response.match.answer_phrases[max_match.answer_index].tokens, function(t){
                    return t.original;
                }).join(" ")
                $word.attr("title", match_tooltip_title + " (" + Math.round(max_match.sim * 100) + "%)");

                $word.attr("data-ref-index", max_match.ref_index);
                $word.attr("data-answer-index", max_match.answer_index);
            }
        });
    });
}

ShortAnswerGrader.prototype.group_ref_chunks = function() {
    var $question_element, $answer_element, $ref_element;
    var self = this;

    $.each(this.$mock_question_tupples, function(index_tuple, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;

        var solution_id = $ref_element.attr("data-solution-id");
        var response = self.hash[solution_id];

        var ref_words = $ref_element.find("span.word");
        var index = 0;

        while(index < ref_words.length) {
            var $word = $(ref_words[index]);

            if($word.is("[data-ref-index]")) {
                var next = index+1;
                while(next < ref_words.length) {
                    $next_word = $(ref_words[next])

                    if($next_word.data("ref-index") == $word.data("ref-index")){
                        var sim = parseFloat($next_word.data("max-match"));
                        $next_word.css("background-color", self.get_similarity_color_code(sim));
                        $next_word.addClass("phrase");
                        next++;
                    }else {
                        break;
                    }
                }

                var sim = parseFloat($word.data("max-match"));
                $word.css("background-color", self.get_similarity_color_code(sim));
                $word.addClass("phrase");
                
                $(ref_words[index]).addClass("first-phrase-word");
                $(ref_words[next-1]).addClass("last-phrase-word");
                
                index = next;

                self.group_answer_chunks(solution_id, $word.data("ref-index"), 
                    $word.data("answer-index"), $word.data("max-match"));
            }else{
                index++;
            }
        }
    });
}

ShortAnswerGrader.prototype.group_answer_chunks = function(solution_id, ref_index, answer_index, sim) {
    var response = this.hash[solution_id];
    var answer_phrase = response.match.answer_phrases[answer_index];

    var self = this;

    $.each(this.$mock_question_tupples, function(index_tuple, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;

        if ($ref_element.attr("data-solution-id") == solution_id) {

            var start_index = -1;
            var end_index = -1;
            var answer_words = $answer_element.find("span.word");
            for(var index=0; index< answer_words.length; index++) {
                var $word = $(answer_words[index]);

                if($word.data("index") >= answer_phrase.start_word_index && $word.data("index") <= answer_phrase.end_word_index) {
                    if(start_index < 0){
                        start_index = $word.data("index");
                    }
                    end_index = $word.data("index");
                }
            }

            for(var index=start_index; index<= end_index; index++) {
                var $word = $(answer_words[index]);

                if(index == start_index) {
                    $word.addClass("first-phrase-word");
                }

                if(index == end_index) {
                    $word.addClass("last-phrase-word");
                }

                $word.addClass("phrase");

                $word.attr("data-toggle", "tooltip");
                var tooltip_title = _.map(response.match.ref_phrases[ref_index].tokens, function(t){
                    return t.original;
                }).join(" ");
                tooltip_title = tooltip_title + " (" + Math.round(sim * 100) + "%)";

                if($word.attr("title")) {
                    $word.attr("title", $word.attr("title") + ", " + tooltip_title);
                }else {
                    $word.attr("title", tooltip_title);
                }

                var max_sim = sim;
                if($word.is("[data-max-match]")) {
                    var current_max = parseFloat($word.attr("data-max-match"));

                    if(sim < current_max) {
                        max_sim = current_max;
                    }
                }
                $word.attr("data-max-match", max_sim);

                $word.css("background-color", self.get_similarity_color_code(max_sim));

                $word.attr("data-answer-index", answer_index);

                if($word.is("[data-ref-indices]")) {
                    $word.attr("data-ref-indices", $word.attr("data-ref-indices") + "," + ref_index);
                } else{
                    $word.attr("data-ref-indices", ref_index);
                }
            }
        }
    });   
}

ShortAnswerGrader.prototype.enable_chunk_highlight = function() {
    var $question_element, $answer_element, $ref_element;
    var self = this;

    $.each(this.$mock_question_tupples, function(index_tupple, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;

        $answer_element.find("span.word.phrase").each(function(index_word, word){
            var $word = $(word);

            $word.mouseenter(function(event){
                var $word = $(event.target);

                var ref_indices = $word.attr("data-ref-indices").split(",");
                _.each(ref_indices, function(ref_index){
                    $paired_ref_element = $word.parent().parent().parent().parent().prev();
                    $paired_ref_element.find("span.word").each(function(ind, ref_word){
                        var $ref_word = $(ref_word);

                        if($ref_word.attr("data-ref-index") == ref_index) {
                            $ref_word.addClass("focus");
                            
                            $ref_word.stop().animate({backgroundColor: '#daffcc'}, 500);
                            setTimeout(() => {
                                $ref_word.stop().animate({
                                    backgroundColor: self.get_similarity_color_code($ref_word.data("max-match"))
                                }, 500);
                            }, 500);
                        }
                    });
                });
                
            });

            $word.mouseleave(function(event){
                var $word = $(event.target);

                $paired_ref_element = $word.parent().parent().parent().parent().prev();
                $paired_ref_element.find("span.word.focus").each(function(ind, ref_word){
                    $ref_word = $(ref_word);
                    $ref_word.removeClass("focus");
                });
            });
        });
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
    
    $("#notebook span.word.phrase[data-max-match]").each(function(index, element){
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

            $.each(tokens, function(token_index, t){
                $mock_element.append($('<span class="word-container"><span class="word" data-text="' + t.text + '" data-lemma="' + t.lemma + '" data-index="' + token_index + '">' + t.text.replace('_', ' ') + '</span></span>'));
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

                var $phrase_container = $target_word.parent().parent();
                $.each($phrase_container.find("span.word-container"), function(index_container, container){
                    var $container = $(container);
                    if(index_container >= answer_start && index_container <= answer_end) {
                        $container.addClass("focus");
                    }
                });

                // Highlight ref phrase
                var ref_start = parseInt($target_word.data("ref-phrase-start"));
                var ref_end = parseInt($target_word.data("ref-phrase-end"));

                var $phrase_container = $target_word.parent().parent().parent().parent().prev();
                $.each($phrase_container.find("span.word-container"), function(index_container, container){
                    var $container = $(container);
                    if(index_container >= ref_start && index_container <= ref_end) {
                        $container.addClass("focus");
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
        $word.removeClass("phrase");
        $word.css("background-color", "transparent");
    } else{
        $word.addClass("phrase");
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