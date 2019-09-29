function ShortAnswerGrader(api_url) {
    this.api_url = api_url;
}

ShortAnswerGrader.prototype.init = function(){
    this.$question_tupples = []

    this.find_question_tupples();
    this.get_similarity_from_api();

    

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
        $ref_element = $(element);
        $answer_element = $ref_element.parent().next().find(".panel-body .rendered_html");
        $question_element =  $ref_element.parent().parent().parent().prev().find(".inner_cell .rendered_html");

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
            self.highlight_max_similar_phrase_pair();
        },
        error: function( jqXhr, textStatus, errorThrown ){
            console.log( "An error occurred while getting similarity from API:" + errorThrown );
        }
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
            $score_element.val((response.sim * full_score).toFixed(2))
            $score_element.trigger("change");
        }
    });
}

ShortAnswerGrader.prototype.create_mock_elements = function() {
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
                $mock_element.append($('<span class="word" data-text="' + t.text + '" data-lemma="' + t.lemma + '">' + t.text.replace('_', ' ') + '</span>'));
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

ShortAnswerGrader.prototype.highlight_max_similar_phrase_pair = function() {
    var self = this;

    $.each(this.$mock_question_tupples, function(index, tupple){
        [$question_element, $answer_element, $ref_element] = tupple;

        var response = self.hash[$ref_element.attr("data-solution-id")];
        var largest_phrase_match = _.max(response.matches, function(m) { return m.sim;});

        // Highlight answer section
        $answer_element.find("span.word").each(function(index, word){
            var $word = $(word);

            // Highlight similarity with ref
            var matches_for_word = _.filter(largest_phrase_match.matches, function(m){return m.answer == $word.data("text")});
            if(matches_for_word.length > 0) {
                var max_match_score = _.max(matches_for_word, function(m){return m.sim;});

                $word.addClass("badge");
                $word.css("background-color", self.get_similarity_color_code(max_match_score.sim));
                
                match_tooltip_title = _.map(matches_for_word, function(m){
                    return m.ref + "(" + m.sim.toFixed(2) + ")";
                }).join(", ")
                $word.attr("title", match_tooltip_title);
            }

            // Highlight question demotion
            var word_lemma = $word.attr("data-lemma");
            $question_element.find("span.word").each(function(index, question_word){
                var $question_word = $(question_word);
                if($question_word.attr("data-lemma") == word_lemma){
                    $word.addClass("badge question-demotion");
                    $question_word.addClass("badge question-demotion");
                }
            });
        });

        // Highlight solution section
        $ref_element.find("span.word").each(function(index, word){
            var $word = $(word);

            // Highlight similarity with ref
            var matches_for_word = _.filter(largest_phrase_match.matches, function(m){return m.ref == $word.data("text")});
            if(matches_for_word.length > 0) {
                var max_match_score = _.max(matches_for_word, function(m){return m.sim;});

                $word.addClass("badge");
                $word.css("background-color", self.get_similarity_color_code(max_match_score.sim));
                
                match_tooltip_title = _.map(matches_for_word, function(m){
                    return m.answer + "(" + m.sim.toFixed(2) + ")";
                }).join(", ")
                $word.attr("title", match_tooltip_title);
            }
        });
    });
}

ShortAnswerGrader.prototype.get_similarity_color_code = function(sim) {
    // Should be darker for higher similarity. 0XFF(255) is lightest 0X55(85) is darkest
    var green_value = (parseInt((1.0-sim) * 170) + 85).toString(16);
    return "#00" + green_value + "00";
}

$(window).load(function () {
    var grader = new ShortAnswerGrader("/grader/api/short-answer");
    grader.init();
});