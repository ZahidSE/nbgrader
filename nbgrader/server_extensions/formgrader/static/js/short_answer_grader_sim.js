function ShortAnswerGrader(api_url) {
    this.api_url = api_url;
}

ShortAnswerGrader.prototype.init = function(){
    var self = this;
    $("div[data-solution-id]").each(function(index, element){
        if(index ==0 ) {
            $ref_element = $(element);
            $answer_element = $ref_element.parent().next().find(".panel-body .rendered_html");
            $question_element =  $ref_element.parent().parent().parent().prev().find(".inner_cell .rendered_html");

            [$question_element, $answer_element, $ref_element] = self.create_mock_elements($question_element, $answer_element, $ref_element);
            self.highlight_max_similar_phrase_pair($question_element, $answer_element, $ref_element);
        }
    });
}

ShortAnswerGrader.prototype.create_mock_elements = function($question_element, $answer_element, $ref_element) {
    var self = this;
    var elements = [$question_element, $answer_element, $ref_element];
    var mock_elements = [];

    $.each(elements, function(index, value) {
        $element = value;
        var element_text = $element.text().trim().replace(/\u00B6/g, "");;
        var $mock_element = $($element.prop('outerHTML'));

        $mock_element.empty();
        $mock_element.attr("data-text", element_text);

        $.each(element_text.split(/[^A-Za-z0-9]/), function(_, value){
            $mock_element.append($('<span class="word" data-text="' + value + '">' + value.replace('_', ' ') + '</span>'));
        });

        mock_elements.push($mock_element);

        $element.parent().append($mock_element);

        $element.addClass("hidden");

        // Highlight question
        if (index == 0)
            $mock_element.addClass("question-text");
    });

    return mock_elements;    
}

ShortAnswerGrader.prototype.highlight_max_similar_phrase_pair = function($question_element, $answer_element, $ref_element) {
    var self = this;
    data = {
        task: {
            cells: [$answer_element.data("text")]
        },
        solution: {
            cells: [$ref_element.data("text")]
        }
    };

    $.ajax({
        url: this.api_url,
        dataType: 'json',
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify(data),
        processData: false,
        success: function( data, textStatus, jQxhr ){
            var response = data[0];
            var largest_phrase_match = _.max(response.matches, function(m) { return m.sim;});

            $.each(largest_phrase_match.matches, function(_, match){
                $answer_element.find("span.word").each(function(_, word){
                    $word = $(word)
                    if(match.answer == $word.data("text")){
                        $word.addClass("badge");
                        $word.css("background-color", self.get_similarity_color_code(match.sim));
                    }
                });

                $ref_element.find("span.word").each(function(_, word){
                    $word = $(word)
                    if(match.ref == $word.data("text")){
                        $word.addClass("badge");
                        $word.css("background-color", self.get_similarity_color_code(match.sim));
                    }
                });
            });
        },
        error: function( jqXhr, textStatus, errorThrown ){
            console.log( "An error occurred while getting similarity from API:" + errorThrown );
        }
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